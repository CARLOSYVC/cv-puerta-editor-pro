import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { InventoryMovementType } from '../generated/prisma/enums.js';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  let service: InventoryService;
  const movement = {
    id: 'movement-id',
    eventUuid: '9d4c6c3e-01ed-4bd0-9f7c-00fb82fb7519',
    materialId: 'material-id',
    movementType: InventoryMovementType.PURCHASE,
    quantity: new Prisma.Decimal('10'),
    unitCost: new Prisma.Decimal('12.50'),
    reference: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdById: 'user-id',
  };
  const prisma = {
    $transaction: vi.fn(),
    inventoryMovement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    material: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const transaction = {
    $queryRaw: vi.fn(),
    inventoryMovement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    material: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  };
  const auditLog = {
    record: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    transaction.inventoryMovement.findUnique.mockResolvedValue(null);
    transaction.inventoryMovement.groupBy.mockResolvedValue([]);
    transaction.material.findUniqueOrThrow.mockResolvedValue({
      unitCost: new Prisma.Decimal('12.50'),
    });
    transaction.inventoryMovement.create.mockImplementation(
      prisma.inventoryMovement.create,
    );
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('records a movement with its material', async () => {
    const adjustment = {
      ...movement,
      movementType: InventoryMovementType.ADJUSTMENT,
    };
    prisma.inventoryMovement.create.mockResolvedValue(adjustment);
    const input = {
      eventUuid: movement.eventUuid,
      materialId: movement.materialId,
      movementType: InventoryMovementType.ADJUSTMENT,
      quantity: 10,
    };

    await expect(
      service.createMovement(input, 'user-id'),
    ).resolves.toEqual(adjustment);
    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        userId: 'user-id',
        action: 'CREATE',
        entity: 'InventoryMovement',
        entityId: movement.id,
        after: expect.objectContaining({
          materialId: movement.materialId,
          quantity: '10',
        }),
      }),
    );
    expect(transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        ...input,
        unitCost: new Prisma.Decimal('12.50'),
        reference: undefined,
        notes: undefined,
        createdById: 'user-id',
      },
      include: {
        material: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        productionOrder: {
          select: { id: true, name: true, project: { select: { name: true } } },
        },
      },
    });
    expect(transaction.material.update).toHaveBeenCalledWith({
      where: { id: movement.materialId },
      data: { unitCost: new Prisma.Decimal('12.50') },
    });
    expect(transaction.$queryRaw).toHaveBeenCalled();
  });

  it('sets the opening weighted-average cost from the initial stock adjustment', async () => {
    transaction.material.findUniqueOrThrow.mockResolvedValue({
      unitCost: new Prisma.Decimal(0),
    });
    prisma.inventoryMovement.create.mockResolvedValue({
      ...movement,
      movementType: InventoryMovementType.ADJUSTMENT,
      quantity: new Prisma.Decimal(5),
      unitCost: new Prisma.Decimal(10),
    });

    await service.createMovement(
      {
        eventUuid: movement.eventUuid,
        materialId: movement.materialId,
        movementType: InventoryMovementType.ADJUSTMENT,
        quantity: 5,
        unitCost: 10,
        reference: 'Inventario inicial',
      },
      'user-id',
    );

    expect(transaction.material.update).toHaveBeenCalledWith({
      where: { id: movement.materialId },
      data: { unitCost: new Prisma.Decimal(10) },
    });
  });

  it('rejects zero movements', async () => {
    await expect(
      service.createMovement(
        {
          eventUuid: movement.eventUuid,
          materialId: movement.materialId,
          movementType: InventoryMovementType.PURCHASE,
          quantity: 0,
        },
        'user-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects negative quantities for non-adjustment movements', async () => {
    await expect(
      service.createMovement(
        {
          eventUuid: movement.eventUuid,
          materialId: movement.materialId,
          movementType: InventoryMovementType.CONSUMPTION,
          quantity: -2,
        },
        'user-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires purchases to be recorded through a purchase order', async () => {
    await expect(
      service.createMovement(
        {
          eventUuid: movement.eventUuid,
          materialId: movement.materialId,
          movementType: InventoryMovementType.PURCHASE,
          quantity: 1,
          unitCost: 12.5,
        },
        'user-id',
      ),
    ).rejects.toThrow('Record purchases through purchase orders and receiving');
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('records consumption at the current material weighted-average cost', async () => {
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('3') },
      },
    ]);
    prisma.inventoryMovement.create.mockResolvedValue({
      ...movement,
      movementType: InventoryMovementType.CONSUMPTION,
      quantity: new Prisma.Decimal('2'),
    });

    await service.createMovement(
      {
        eventUuid: movement.eventUuid,
        materialId: movement.materialId,
        movementType: InventoryMovementType.CONSUMPTION,
        quantity: 2,
      },
      'user-id',
      'production-order-id',
    );

    expect(transaction.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: InventoryMovementType.CONSUMPTION,
          unitCost: new Prisma.Decimal('12.50'),
        }),
      }),
    );
  });

  it('rejects a movement that would make stock negative', async () => {
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('3') },
      },
    ]);

    await expect(
      service.createMovement(
        {
          eventUuid: movement.eventUuid,
          materialId: movement.materialId,
          movementType: InventoryMovementType.EXIT,
          quantity: 4,
        },
        'user-id',
      ),
    ).rejects.toThrow('Inventario insuficiente');
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a production consumption that exceeds available stock', async () => {
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('1') },
      },
    ]);

    await expect(
      service.createMovement(
        {
          eventUuid: movement.eventUuid,
          materialId: movement.materialId,
          movementType: InventoryMovementType.CONSUMPTION,
          quantity: 1.01,
        },
        'user-id',
        'production-order-id',
      ),
    ).rejects.toThrow('Inventario insuficiente');
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('allows an adjustment that brings stock exactly to zero', async () => {
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('3') },
      },
    ]);

    await service.createMovement(
      {
        eventUuid: movement.eventUuid,
        materialId: movement.materialId,
        movementType: InventoryMovementType.ADJUSTMENT,
        quantity: -3,
      },
      'user-id',
    );

    expect(transaction.inventoryMovement.create).toHaveBeenCalled();
  });

  it('returns an existing idempotent movement without applying its stock change twice', async () => {
    transaction.inventoryMovement.findUnique.mockResolvedValue({
      ...movement,
      productionOrderId: null,
    });
    const input = {
      eventUuid: movement.eventUuid,
      materialId: movement.materialId,
      movementType: InventoryMovementType.PURCHASE,
      quantity: 10,
      unitCost: 12.5,
    };

    await expect(
      service.createMovement(input, 'another-user'),
    ).resolves.toEqual({ ...movement, productionOrderId: null });
    expect(transaction.inventoryMovement.groupBy).not.toHaveBeenCalled();
    expect(transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('lists movements newest first with material details', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([movement]);

    await expect(service.findMovements()).resolves.toEqual([movement]);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      include: {
        material: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updates movement details and records the user who updated them', async () => {
    transaction.inventoryMovement.findUniqueOrThrow.mockResolvedValue({
      id: movement.id,
      materialId: movement.materialId,
      movementType: InventoryMovementType.ADJUSTMENT,
      quantity: new Prisma.Decimal('10'),
    });
    transaction.inventoryMovement.update.mockResolvedValue({
      ...movement,
      quantity: new Prisma.Decimal('8'),
      updatedById: 'editor-id',
    });

    await expect(
      service.updateMovement(
        movement.id,
        { quantity: 8, reference: 'PO-123' },
        'editor-id',
      ),
    ).resolves.toMatchObject({ updatedById: 'editor-id' });

    expect(transaction.inventoryMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: movement.id },
        data: {
          quantity: 8,
          reference: 'PO-123',
          updatedById: 'editor-id',
        },
        include: expect.objectContaining({
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        }),
      }),
    );
    expect(transaction.inventoryMovement.groupBy).toHaveBeenCalledWith({
      by: ['movementType'],
      where: { materialId: movement.materialId, id: { not: movement.id } },
      _sum: { quantity: true },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        userId: 'editor-id',
        action: 'UPDATE',
        entity: 'InventoryMovement',
        entityId: movement.id,
        before: expect.objectContaining({ quantity: '10' }),
        after: expect.objectContaining({ quantity: '8' }),
      }),
    );
  });

  it('prevents editing the quantity or cost of a recorded purchase', async () => {
    transaction.inventoryMovement.findUniqueOrThrow.mockResolvedValue({
      id: movement.id,
      materialId: movement.materialId,
      productionOrderId: null,
      movementType: InventoryMovementType.PURCHASE,
      quantity: new Prisma.Decimal('10'),
      unitCost: new Prisma.Decimal('12.50'),
      reference: null,
      notes: null,
    });

    await expect(
      service.updateMovement(movement.id, { unitCost: 13 }, 'editor-id'),
    ).rejects.toThrow('Purchase quantity and cost cannot be edited');
    expect(transaction.inventoryMovement.update).not.toHaveBeenCalled();
  });

  it('rejects an edit that would make stock negative', async () => {
    transaction.inventoryMovement.findUniqueOrThrow.mockResolvedValue({
      id: movement.id,
      materialId: movement.materialId,
      movementType: InventoryMovementType.EXIT,
      quantity: new Prisma.Decimal('2'),
    });
    transaction.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('5') },
      },
    ]);

    await expect(
      service.updateMovement(movement.id, { quantity: 6 }, 'editor-id'),
    ).rejects.toThrow('Inventario insuficiente');
    expect(transaction.inventoryMovement.update).not.toHaveBeenCalled();
  });

  it('calculates stock as entries minus exits and applies signed adjustments', async () => {
    const material = {
      id: 'material-id',
      name: 'Cotton',
      unit: 'meter',
      minimumStock: new Prisma.Decimal('3'),
    };
    prisma.material.findUniqueOrThrow.mockResolvedValue(material);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('10') },
      },
      {
        movementType: InventoryMovementType.RETURN,
        _sum: { quantity: new Prisma.Decimal('2') },
      },
      {
        movementType: InventoryMovementType.CONSUMPTION,
        _sum: { quantity: new Prisma.Decimal('4') },
      },
      {
        movementType: InventoryMovementType.EXIT,
        _sum: { quantity: new Prisma.Decimal('2') },
      },
      {
        movementType: InventoryMovementType.ADJUSTMENT,
        _sum: { quantity: new Prisma.Decimal('-1') },
      },
    ]);

    await expect(service.getMaterialStock(material.id)).resolves.toEqual({
      ...material,
      stock_actual: 5,
      stock: 5,
      status: 'IN_STOCK',
    });
    expect(prisma.inventoryMovement.groupBy).toHaveBeenCalledWith({
      by: ['movementType'],
      where: { materialId: material.id },
      _sum: { quantity: true },
    });
  });

  it('lists stock levels and flags stock at or below its minimum', async () => {
    prisma.material.findMany.mockResolvedValue([
      {
        id: 'material-id',
        name: 'Cotton',
        unit: 'meter',
        minimumStock: new Prisma.Decimal('7'),
      },
      {
        id: 'other-material-id',
        name: 'Linen',
        unit: 'meter',
        minimumStock: new Prisma.Decimal('6'),
      },
      {
        id: 'empty-material-id',
        name: 'Thread',
        unit: 'roll',
        minimumStock: new Prisma.Decimal('0'),
      },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        materialId: 'material-id',
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('10') },
      },
      {
        materialId: 'material-id',
        movementType: InventoryMovementType.CONSUMPTION,
        _sum: { quantity: new Prisma.Decimal('3') },
      },
      {
        materialId: 'other-material-id',
        movementType: InventoryMovementType.PURCHASE,
        _sum: { quantity: new Prisma.Decimal('7') },
      },
    ]);

    await expect(service.getStockLevels()).resolves.toEqual([
      {
        id: 'material-id',
        name: 'Cotton',
        unit: 'meter',
        minimumStock: new Prisma.Decimal('7'),
        stock_actual: 7,
        status: 'LOW_STOCK',
      },
      {
        id: 'other-material-id',
        name: 'Linen',
        unit: 'meter',
        minimumStock: new Prisma.Decimal('6'),
        stock_actual: 7,
        status: 'IN_STOCK',
      },
      {
        id: 'empty-material-id',
        name: 'Thread',
        unit: 'roll',
        minimumStock: new Prisma.Decimal('0'),
        stock_actual: 0,
        status: 'CRITICAL',
      },
    ]);
    expect(prisma.inventoryMovement.groupBy).toHaveBeenCalledWith({
      by: ['materialId', 'movementType'],
      _sum: { quantity: true },
    });
  });

  it('returns a material history newest first', async () => {
    prisma.material.findUniqueOrThrow.mockResolvedValue({ id: 'material-id' });
    prisma.inventoryMovement.findMany.mockResolvedValue([movement]);

    await expect(service.getMaterialHistory('material-id')).resolves.toEqual([
      movement,
    ]);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { materialId: 'material-id' },
      include: {
        material: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
