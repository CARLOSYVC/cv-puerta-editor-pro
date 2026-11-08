import { Prisma } from '../generated/prisma/client.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { InventoryMovementType } from '../generated/prisma/enums.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { OperationsService } from './operations.service.js';

describe('OperationsService', () => {
  let service: OperationsService;
  const prisma = {
    $transaction: vi.fn(),
    productionOrder: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    client: {
      count: vi.fn(),
    },
    purchaseOrder: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    purchaseReceipt: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    material: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    inventoryMovement: {
      findMany: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
    },
  };
  const inventoryService = {
    createMovement: vi.fn(),
  };
  const auditLog = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  const transaction = {
    productionOrder: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.project.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventoryService },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    service = module.get<OperationsService>(OperationsService);
  });

  it('audits production order creation in the same transaction', async () => {
    const created = {
      id: 'order-id',
      name: 'Batch 1',
      description: null,
      status: 'PLANNED',
      projectId: 'project-id',
      project: { id: 'project-id', name: 'Project A' },
    };
    transaction.productionOrder.create.mockResolvedValue(created);

    await expect(
      service.createProductionOrder(
        { name: 'Batch 1', projectId: 'project-id' },
        'user-id',
      ),
    ).resolves.toEqual(created);

    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        userId: 'user-id',
        action: 'CREATE',
        entity: 'ProductionOrder',
        entityId: 'order-id',
        after: expect.objectContaining({
          name: 'Batch 1',
          projectId: 'project-id',
        }),
      }),
    );
  });

  it('creates an inventory consumption linked to its production order', async () => {
    const created = {
      id: 'movement-id',
      movementType: InventoryMovementType.CONSUMPTION,
      productionOrderId: 'order-id',
    };
    inventoryService.createMovement.mockResolvedValue(created);

    await expect(
      service.createMaterialConsumption({
        productionOrderId: 'order-id',
        materialId: 'material-id',
        quantity: 2,
      }, 'user-id'),
    ).resolves.toEqual(created);

    expect(inventoryService.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
          materialId: 'material-id',
          movementType: InventoryMovementType.CONSUMPTION,
          quantity: 2,
          eventUuid: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          ),
      }),
      'user-id',
      'order-id',
    );
  });

  it('calculates cost totals from the unit cost saved at consumption time', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'movement-one',
        productionOrderId: 'order-id',
        productionOrder: {
          id: 'order-id',
          name: 'Batch 1',
          project: { name: 'Project A' },
        },
        material: { id: 'material-id', name: 'Cotton', unit: 'meter' },
        quantity: new Prisma.Decimal('2'),
        unitCost: new Prisma.Decimal('12.50'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'movement-two',
        productionOrderId: 'order-id',
        productionOrder: {
          id: 'order-id',
          name: 'Batch 1',
          project: { name: 'Project A' },
        },
        material: { id: 'material-id', name: 'Cotton', unit: 'meter' },
        quantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('10'),
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);

    const report = await service.getCosts();

    expect(report.entries).toHaveLength(2);
    expect(report.entries[0].totalCost.toString()).toBe('25');
    expect(report.orders[0].totalCost.toString()).toBe('35');
    expect(report.totalCost.toString()).toBe('35');
  });

  it('returns dashboard metrics for critical stock, active work, and this month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    prisma.material.findMany.mockResolvedValue([
      { id: 'critical-material' },
      { id: 'available-material' },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        materialId: 'available-material',
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('10') },
      },
      {
        materialId: 'available-material',
        movementType: InventoryMovementType.EXIT,
        _sum: { quantity: new Prisma.Decimal('2') },
      },
    ]);
    prisma.productionOrder.count.mockResolvedValue(3);
    prisma.project.count.mockResolvedValue(4);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        quantity: new Prisma.Decimal('2'),
        unitCost: new Prisma.Decimal('12.50'),
      },
      {
        quantity: new Prisma.Decimal('3'),
        unitCost: new Prisma.Decimal('4'),
      },
    ]);

    await expect(service.getDashboardMetrics()).resolves.toMatchObject({
      criticalMaterials: 1,
      activeOrders: 3,
      monthlyProductionCost: new Prisma.Decimal('37'),
      monthlyConsumptions: 2,
      activeProjects: 4,
      monthStart: new Date('2026-11-01T00:00:00.000Z'),
      nextMonthStart: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(prisma.productionOrder.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['PLANNED', 'IN_PROGRESS'],
        },
      },
    });
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { status: 'IN_PROGRESS' },
    });
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: {
        movementType: InventoryMovementType.CONSUMPTION,
        createdAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lt: new Date('2026-12-01T00:00:00.000Z'),
        },
      },
      select: { quantity: true, unitCost: true },
    });
    vi.useRealTimers();
  });

  it('calculates monthly inventory, production, purchasing, consumption, and top ten metrics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    prisma.material.findMany.mockResolvedValue([
      {
        id: 'critical',
        name: 'Critical',
        unit: 'piece',
        unitCost: new Prisma.Decimal(8),
        minimumStock: new Prisma.Decimal(0),
      },
      {
        id: 'stocked',
        name: 'Stocked',
        unit: 'meter',
        unitCost: new Prisma.Decimal(10),
        minimumStock: new Prisma.Decimal(6),
      },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        materialId: 'stocked',
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal(5) },
      },
    ]);
    prisma.productionOrder.groupBy.mockResolvedValue([
      { status: 'PLANNED', _count: { _all: 1 } },
      { status: 'IN_PROGRESS', _count: { _all: 1 } },
      { status: 'COMPLETED', _count: { _all: 2 } },
      { status: 'CANCELLED', _count: { _all: 3 } },
    ]);
    prisma.client.count.mockResolvedValue(3);
    prisma.project.count.mockResolvedValue(4);
    prisma.project.findMany.mockResolvedValue([
      {
        id: 'project-one',
        name: 'Project One',
        estimatedRevenue: new Prisma.Decimal(100),
      },
      {
        id: 'project-two',
        name: 'Project Two',
        estimatedRevenue: new Prisma.Decimal(50),
      },
    ]);
    prisma.purchaseOrder.count.mockResolvedValue(5);
    const monthlyConsumptionRows = [
      {
        productionOrderId: 'order-one',
        createdAt: new Date('2026-11-07T10:00:00Z'),
        quantity: new Prisma.Decimal(3),
        unitCost: new Prisma.Decimal(5),
        material: { id: 'material-one', name: 'Canvas', unit: 'meter' },
        productionOrder: {
          project: { id: 'project-one', name: 'Project One' },
        },
      },
      {
        productionOrderId: 'order-one',
        createdAt: new Date('2026-11-07T11:00:00Z'),
        quantity: new Prisma.Decimal(2),
        unitCost: new Prisma.Decimal(10),
        material: { id: 'material-two', name: 'Thread', unit: 'spool' },
        productionOrder: {
          project: { id: 'project-one', name: 'Project One' },
        },
      },
    ];
    prisma.inventoryMovement.findMany
      .mockResolvedValueOnce(monthlyConsumptionRows)
      .mockResolvedValueOnce([
        ...monthlyConsumptionRows,
        {
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(10),
          productionOrder: { project: { id: 'project-two' } },
        },
      ]);
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        status: 'PARTIALLY_RECEIVED',
        expectedAt: new Date('2026-11-06T00:00:00Z'),
        items: [
          {
            quantity: new Prisma.Decimal(10),
            receivedQuantity: new Prisma.Decimal(5),
            unitCost: new Prisma.Decimal(10),
          },
        ],
      },
    ]);
    prisma.purchaseReceipt.count.mockResolvedValue(4);
    prisma.purchaseReceipt.findMany.mockResolvedValue([
      {
        purchaseOrder: { supplierId: 'supplier-a', supplier: { name: 'Supplier A' } },
        items: [{
          quantity: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(10),
          purchaseOrderItem: {
            materialId: 'material-one',
            material: { id: 'material-one', name: 'Canvas', unit: 'meter' },
          },
        }],
      },
      {
        purchaseOrder: { supplierId: 'supplier-b', supplier: { name: 'Supplier B' } },
        items: [{
          quantity: new Prisma.Decimal(4),
          unitCost: new Prisma.Decimal(20),
          purchaseOrderItem: {
            materialId: 'material-two',
            material: { id: 'material-two', name: 'Thread', unit: 'spool' },
          },
        }],
      },
      {
        purchaseOrder: { supplierId: 'supplier-a', supplier: { name: 'Supplier A' } },
        items: [{
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(10),
          purchaseOrderItem: {
            materialId: 'material-one',
            material: { id: 'material-one', name: 'Canvas', unit: 'meter' },
          },
        }],
      },
    ]);

    const metrics = await service.getExecutiveDashboardMetrics();
    expect(metrics).toMatchObject({
      inventoryCost: new Prisma.Decimal(50),
      estimatedSales: new Prisma.Decimal(150),
      productionCost: new Prisma.Decimal(55),
      estimatedProfit: new Prisma.Decimal(95),
      estimatedMargin: new Prisma.Decimal(95).div(150).mul(100),
      averageProductionCostPerProject: new Prisma.Decimal('27.5'),
      monthlyProductionCost: new Prisma.Decimal(35),
      averageMonthlyProductionCostPerOrder: new Prisma.Decimal('35'),
      monthlyPurchases: new Prisma.Decimal(150),
      monthlyConsumptions: 2,
      activeOrders: 2,
      cancelledProductionOrders: 3,
      productionStatusBreakdown: [
        { status: 'PLANNED', count: 1 },
        { status: 'IN_PROGRESS', count: 1 },
        { status: 'COMPLETED', count: 2 },
        { status: 'CANCELLED', count: 3 },
      ],
      activeClients: 3,
      activeProjects: 4,
      pendingPurchases: 5,
      criticalMaterials: 1,
      lowStockMaterials: 1,
      overduePurchaseOrders: 1,
      pendingReceipts: 1,
      weeklyReceipts: 4,
      topConsumedMaterials: [
        {
          materialId: 'material-two',
          material: 'Thread',
          unit: 'spool',
          quantity: new Prisma.Decimal(2),
          totalCost: new Prisma.Decimal(20),
        },
        {
          materialId: 'material-one',
          material: 'Canvas',
          unit: 'meter',
          quantity: new Prisma.Decimal(3),
          totalCost: new Prisma.Decimal(15),
        },
      ],
      topSuppliers: [
        { supplierId: 'supplier-b', supplier: 'Supplier B', total: new Prisma.Decimal(80) },
        { supplierId: 'supplier-a', supplier: 'Supplier A', total: new Prisma.Decimal(70) },
      ],
      monthlyPurchasesBySupplier: [
        { supplierId: 'supplier-b', supplier: 'Supplier B', total: new Prisma.Decimal(80) },
        { supplierId: 'supplier-a', supplier: 'Supplier A', total: new Prisma.Decimal(70) },
      ],
      monthlyProductionCostsByProject: [
        {
          projectId: 'project-one',
          project: 'Project One',
          totalCost: new Prisma.Decimal(35),
        },
      ],
      consumptionLast30Days: expect.arrayContaining([
        {
          date: '2026-11-07',
          movementCount: 2,
          quantity: new Prisma.Decimal(5),
          totalCost: new Prisma.Decimal(35),
        },
      ]),
      monthStart: new Date('2026-11-01T00:00:00.000Z'),
      nextMonthStart: new Date('2026-12-01T00:00:00.000Z'),
      weekStart: new Date('2026-11-02T00:00:00.000Z'),
      nextWeekStart: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(metrics.consumptionLast30Days).toHaveLength(30);
    expect(metrics.consumptionLast30Days[0].date).toBe('2026-10-09');
    expect(metrics.consumptionLast30Days[29].date).toBe('2026-11-07');
    expect(prisma.client.count).toHaveBeenCalledWith({
      where: {
        projects: {
          some: { status: 'IN_PROGRESS' },
        },
      },
    });
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { status: 'IN_PROGRESS' },
    });
    expect(prisma.purchaseOrder.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'],
        },
      },
    });
    expect(prisma.productionOrder.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
    });
    expect(prisma.material.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        unit: true,
        unitCost: true,
        minimumStock: true,
      },
    });
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: {
        movementType: InventoryMovementType.CONSUMPTION,
        createdAt: {
          gte: new Date('2026-10-09T00:00:00.000Z'),
          lt: new Date('2026-11-08T00:00:00.000Z'),
        },
      },
      select: {
        productionOrderId: true,
        createdAt: true,
        quantity: true,
        unitCost: true,
        material: { select: { id: true, name: true, unit: true } },
        productionOrder: {
          select: {
            project: { select: { id: true, name: true } },
          },
        },
      },
    });
    expect(prisma.purchaseReceipt.count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-11-02T00:00:00.000Z'),
          lt: new Date('2026-11-09T00:00:00.000Z'),
        },
      },
    });
    expect(prisma.purchaseReceipt.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lt: new Date('2026-12-01T00:00:00.000Z'),
        },
      },
      include: expect.any(Object),
    });
    vi.useRealTimers();
  });

  it('limits monthly material and supplier rankings to the top ten', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    prisma.material.findMany.mockResolvedValue([]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([]);
    prisma.productionOrder.groupBy.mockResolvedValue([]);
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    prisma.purchaseReceipt.count.mockResolvedValue(0);
    prisma.inventoryMovement.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => {
        const rank = 11 - index;
        return {
          productionOrderId: `order-${rank}`,
          createdAt: new Date('2026-11-07T10:00:00Z'),
          quantity: new Prisma.Decimal(1),
          unitCost: new Prisma.Decimal(rank),
          material: {
            id: `material-${rank}`,
            name: `Material ${rank}`,
            unit: 'piece',
          },
          productionOrder: {
            project: { id: `project-${rank}`, name: `Project ${rank}` },
          },
        };
      }),
    );
    prisma.purchaseReceipt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => {
        const rank = 11 - index;
        return {
          purchaseOrder: {
            supplierId: `supplier-${rank}`,
            supplier: { name: `Supplier ${rank}` },
          },
          items: [{
            quantity: new Prisma.Decimal(1),
            unitCost: new Prisma.Decimal(rank),
          }],
        };
      }),
    );

    const metrics = await service.getExecutiveDashboardMetrics();

    expect(metrics.topConsumedMaterials).toHaveLength(10);
    expect(metrics.topConsumedMaterials[0].material).toBe('Material 11');
    expect(metrics.topConsumedMaterials[9].material).toBe('Material 2');
    expect(metrics.topSuppliers).toHaveLength(10);
    expect(metrics.topSuppliers[0].supplier).toBe('Supplier 11');
    expect(metrics.topSuppliers[9].supplier).toBe('Supplier 2');
    vi.useRealTimers();
  });
});
