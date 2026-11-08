import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PurchaseOrderStatus } from '../generated/prisma/enums.js';
import { Test } from '@nestjs/testing';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PurchasingService } from './purchasing.service.js';

describe('PurchasingService', () => {
  let service: PurchasingService;
  const prisma = {
    $transaction: vi.fn(),
    supplier: { findMany: vi.fn(), count: vi.fn() },
    purchaseOrder: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
    purchaseReceipt: { create: vi.fn(), findMany: vi.fn() },
  };
  const transaction = {
    $queryRaw: vi.fn(),
    purchaseOrder: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    purchaseReceipt: { create: vi.fn() },
    purchaseOrderItem: { update: vi.fn() },
    inventoryMovement: { create: vi.fn(), groupBy: vi.fn() },
    material: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
  const order = {
    id: 'order-id',
    supplierId: 'supplier-id',
    status: PurchaseOrderStatus.ORDERED,
    expectedAt: null,
    notes: null,
    items: [{
      id: 'item-id',
      materialId: 'material-id',
      quantity: new Prisma.Decimal(10),
      receivedQuantity: new Prisma.Decimal(0),
      unitCost: new Prisma.Decimal(4),
    }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    transaction.purchaseOrder.findUniqueOrThrow.mockResolvedValue(order);
    transaction.purchaseOrderItem.update.mockResolvedValue({});
    transaction.inventoryMovement.create.mockResolvedValue({});
    transaction.inventoryMovement.groupBy.mockResolvedValue([]);
    transaction.material.findUniqueOrThrow.mockResolvedValue({
      unitCost: new Prisma.Decimal(4),
    });
    transaction.material.update.mockResolvedValue({});
    transaction.purchaseReceipt.create.mockResolvedValue({ id: 'receipt-id', items: [] });
    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    service = module.get<PurchasingService>(PurchasingService);
  });

  it('receives an ordered item, creates its inventory movement, and audits atomically', async () => {
    const updatedOrder = {
      ...order,
      status: PurchaseOrderStatus.RECEIVED,
      items: [{ ...order.items[0], receivedQuantity: new Prisma.Decimal(10) }],
    };
    transaction.purchaseOrder.update.mockResolvedValue(updatedOrder);

    await expect(service.receivePurchaseOrder('order-id', {
      reference: 'DEL-10',
      items: [{
        purchaseOrderItemId: 'item-id',
        quantity: 10,
        actualUnitCost: 5,
      }],
    }, 'user-id')).resolves.toMatchObject({
      receipt: { id: 'receipt-id' },
      purchaseOrder: { status: PurchaseOrderStatus.RECEIVED },
    });

    expect(transaction.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: 'item-id' },
      data: { receivedQuantity: new Prisma.Decimal(10) },
    });
    expect(transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialId: 'material-id',
        purchaseOrderId: 'order-id',
        movementType: 'PURCHASE',
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(5),
        createdById: 'user-id',
      }),
    });
    expect(transaction.purchaseReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [{
              purchaseOrderItemId: 'item-id',
              quantity: new Prisma.Decimal(10),
              unitCost: new Prisma.Decimal(5),
            }],
          },
        }),
      }),
    );
    expect(transaction.material.update).toHaveBeenCalledWith({
      where: { id: 'material-id' },
      data: { unitCost: new Prisma.Decimal(5) },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        entity: 'PurchaseOrder',
        action: 'UPDATE',
        entityId: 'order-id',
        userId: 'user-id',
      }),
    );
  });

  it('updates the weighted-average material cost using received inventory value', async () => {
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: 'PURCHASE',
        _sum: { quantity: new Prisma.Decimal(2) },
      },
    ]);

    await service.receivePurchaseOrder('order-id', {
      items: [{
        purchaseOrderItemId: 'item-id',
        quantity: 2,
        actualUnitCost: 6,
      }],
    }, 'user-id');

    expect(transaction.material.update).toHaveBeenCalledWith({
      where: { id: 'material-id' },
      data: { unitCost: new Prisma.Decimal(5) },
    });
  });

  it('calculates monthly purchasing spend from actual receipt prices', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    prisma.supplier.count.mockResolvedValue(1);
    prisma.purchaseOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.purchaseReceipt.findMany.mockResolvedValue([
      {
        items: [{
          quantity: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(7),
        }],
      },
    ]);

    await expect(service.getMetrics()).resolves.toMatchObject({
      monthlyReceipts: 1,
      monthlySpend: new Prisma.Decimal(35),
    });

    vi.useRealTimers();
  });

  it('rejects receiving more than the remaining ordered quantity', async () => {
    await expect(service.receivePurchaseOrder('order-id', {
      items: [{ purchaseOrderItemId: 'item-id', quantity: 11 }],
    }, 'user-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.purchaseReceipt.create).not.toHaveBeenCalled();
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects receipt items from a different purchase order', async () => {
    await expect(service.receivePurchaseOrder('order-id', {
      items: [{ purchaseOrderItemId: 'foreign-item', quantity: 1 }],
    }, 'user-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.purchaseReceipt.create).not.toHaveBeenCalled();
  });

  it('calculates monthly spend, average supplier cost, top material, overdue receipts, and open orders', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    prisma.purchaseOrder.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.purchaseReceipt.findMany.mockResolvedValue([
      {
        id: 'receipt-one',
        purchaseOrderId: 'order-one',
        createdAt: new Date('2026-11-03T10:00:00Z'),
        purchaseOrder: {
          supplierId: 'supplier-a',
          supplier: { name: 'Supplier A' },
        },
        items: [{
          quantity: new Prisma.Decimal(10),
          unitCost: new Prisma.Decimal(10),
          purchaseOrderItem: {
            materialId: 'material-one',
            unitCost: new Prisma.Decimal(100),
            material: { id: 'material-one', name: 'Canvas', unit: 'meter' },
          },
        }],
      },
      {
        id: 'receipt-two',
        purchaseOrderId: 'order-two',
        createdAt: new Date('2026-11-04T10:00:00Z'),
        purchaseOrder: {
          supplierId: 'supplier-b',
          supplier: { name: 'Supplier B' },
        },
        items: [{
          quantity: new Prisma.Decimal(10),
          unitCost: new Prisma.Decimal(20),
          purchaseOrderItem: {
            materialId: 'material-two',
            unitCost: new Prisma.Decimal(200),
            material: { id: 'material-two', name: 'Thread', unit: 'spool' },
          },
        }],
      },
      {
        id: 'receipt-old',
        purchaseOrderId: 'order-old',
        createdAt: new Date('2026-10-31T10:00:00Z'),
        purchaseOrder: {
          supplierId: 'supplier-a',
          supplier: { name: 'Supplier A' },
        },
        items: [{
          quantity: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(10),
          purchaseOrderItem: {
            materialId: 'material-one',
            unitCost: new Prisma.Decimal(10),
            material: { id: 'material-one', name: 'Canvas', unit: 'meter' },
          },
        }],
      },
    ]);

    await expect(service.getReport()).resolves.toMatchObject({
      monthlySpend: new Prisma.Decimal(300),
      averageSupplierCost: new Prisma.Decimal(150),
      topMonthlyMaterial: {
        materialId: 'material-two',
        material: 'Thread',
        total: new Prisma.Decimal(200),
      },
      overdueReceipts: 2,
      openOrders: 3,
      totalSpend: new Prisma.Decimal(350),
    });
    expect(prisma.purchaseOrder.count).toHaveBeenNthCalledWith(1, {
      where: {
        status: {
          in: [
            PurchaseOrderStatus.DRAFT,
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
          ],
        },
      },
    });
    expect(prisma.purchaseOrder.count).toHaveBeenNthCalledWith(2, {
      where: {
        status: {
          in: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
        },
        expectedAt: { lt: new Date('2026-11-07T18:00:00.000Z') },
      },
    });
    vi.useRealTimers();
  });
});
