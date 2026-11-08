import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { InventoryMovementType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { weightedAverageUnitCost } from './inventory-cost.js';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto.js';
import { UpdateInventoryMovementDto } from './dto/update-inventory-movement.dto.js';
import { paginatedResult, type ListQueryDto } from '../common/list-query.dto.js';

function isDuplicateEvent(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function getStockStatus(stock: number, minimum: number): 'CRITICAL' | 'LOW_STOCK' | 'IN_STOCK' {
  if (stock <= 0) return 'CRITICAL';
  return stock <= minimum ? 'LOW_STOCK' : 'IN_STOCK';
}

function movementAuditSnapshot(movement: {
  id: string;
  materialId: string;
  productionOrderId: string | null;
  movementType: InventoryMovementType;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  reference: string | null;
  notes: string | null;
}) {
  return {
    id: movement.id,
    materialId: movement.materialId,
    productionOrderId: movement.productionOrderId,
    movementType: movement.movementType,
    quantity: movement.quantity.toString(),
    unitCost: movement.unitCost?.toString() ?? null,
    reference: movement.reference,
    notes: movement.notes,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createMovement(
    input: CreateInventoryMovementDto,
    userId: string,
    productionOrderId?: string,
  ) {
    if (input.quantity === 0) {
      throw new BadRequestException('Movement quantity cannot be zero');
    }

    if (
      input.movementType !== InventoryMovementType.ADJUSTMENT &&
      input.quantity < 0
    ) {
      throw new BadRequestException(
        'Only adjustment movements can have a negative quantity',
      );
    }
    if (
      input.movementType === InventoryMovementType.CONSUMPTION &&
      input.unitCost !== undefined
    ) {
      throw new BadRequestException(
        'Consumption cost is determined by the current weighted average',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "Material" WHERE "id" = ${input.materialId} FOR UPDATE
        `;

        const existing = await transaction.inventoryMovement.findUnique({
          where: { eventUuid: input.eventUuid },
          include: {
            material: { select: { id: true, name: true, unit: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            updatedBy: { select: { id: true, name: true, email: true } },
            productionOrder: {
              select: { id: true, name: true, project: { select: { name: true } } },
            },
          },
        });
        if (existing) {
          const samePayload =
            existing.materialId === input.materialId &&
            existing.movementType === input.movementType &&
            existing.quantity.equals(new Prisma.Decimal(input.quantity)) &&
            (input.unitCost === undefined ||
              existing.unitCost?.equals(new Prisma.Decimal(input.unitCost))) &&
            existing.reference === (input.reference ?? null) &&
            existing.notes === (input.notes ?? null) &&
            existing.productionOrderId === (productionOrderId ?? null);
          if (samePayload) return existing;
          throw new BadRequestException(
            'This event UUID has already been used for a different movement',
          );
        }
        if (input.movementType === InventoryMovementType.PURCHASE) {
          throw new BadRequestException(
            'Record purchases through purchase orders and receiving',
          );
        }

        const material =
          input.movementType === InventoryMovementType.CONSUMPTION ||
          input.movementType === InventoryMovementType.RETURN ||
          (input.movementType === InventoryMovementType.ADJUSTMENT &&
            input.quantity > 0)
            ? await transaction.material.findUniqueOrThrow({
                where: { id: input.materialId },
                select: { unitCost: true },
              }).catch(handlePrismaError)
            : null;
        const existingMovements =
          await transaction.inventoryMovement.groupBy({
            by: ['movementType'],
            where: { materialId: input.materialId },
            _sum: { quantity: true },
          });
        const currentStock = existingMovements.reduce((stock, movement) => {
          const quantity = movement._sum.quantity ?? new Prisma.Decimal(0);
          switch (movement.movementType) {
            case InventoryMovementType.PURCHASE:
            case InventoryMovementType.RETURN:
              return stock.add(quantity);
            case InventoryMovementType.EXIT:
            case InventoryMovementType.CONSUMPTION:
              return stock.sub(quantity);
            case InventoryMovementType.ADJUSTMENT:
              return stock.add(quantity);
          }
        }, new Prisma.Decimal(0));
        const quantity = new Prisma.Decimal(input.quantity);
        const stockChange =
          input.movementType === InventoryMovementType.RETURN
            ? quantity
            : input.movementType === InventoryMovementType.ADJUSTMENT
              ? quantity
              : quantity.negated();
        const nextStock = currentStock.add(stockChange);

        if (nextStock.lessThan(0)) {
          throw new BadRequestException('Inventario insuficiente');
        }

        const movementUnitCost =
          input.movementType === InventoryMovementType.CONSUMPTION ||
          input.movementType === InventoryMovementType.RETURN ||
          (input.movementType === InventoryMovementType.ADJUSTMENT &&
            input.quantity > 0)
            ? input.unitCost ?? material?.unitCost
            : input.unitCost;
        let averageUnitCostChange:
          | { before: Prisma.Decimal; after: Prisma.Decimal }
          | undefined;
        if (
          input.movementType === InventoryMovementType.ADJUSTMENT &&
          input.quantity > 0 &&
          material
        ) {
          const nextUnitCost = weightedAverageUnitCost(
            currentStock,
            material.unitCost,
            [
              {
                quantity,
                unitCost: new Prisma.Decimal(
                  input.unitCost ?? material.unitCost,
                ),
              },
            ],
          );
          await transaction.material.update({
            where: { id: input.materialId },
            data: { unitCost: nextUnitCost },
          });
          averageUnitCostChange = { before: material.unitCost, after: nextUnitCost };
        }

        const created = await transaction.inventoryMovement.create({
          data: {
            eventUuid: input.eventUuid,
            materialId: input.materialId,
            productionOrderId,
            movementType: input.movementType,
            quantity: input.quantity,
            unitCost: movementUnitCost,
            reference: input.reference,
            notes: input.notes,
            createdById: userId,
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
        await this.auditLog.record(transaction, {
          userId,
          action: 'CREATE',
          entity: 'InventoryMovement',
          entityId: created.id,
          after: {
            ...movementAuditSnapshot(created),
            ...(averageUnitCostChange && {
              averageUnitCostChange: {
                before: averageUnitCostChange.before.toString(),
                after: averageUnitCostChange.after.toString(),
              },
            }),
          },
        });
        return created;
      });
    } catch (error) {
      if (isDuplicateEvent(error)) {
        const existing = await this.prisma.inventoryMovement.findUnique({
          where: { eventUuid: input.eventUuid },
          include: {
            material: {
              select: { id: true, name: true, unit: true },
            },
            createdBy: { select: { id: true, name: true, email: true } },
            updatedBy: { select: { id: true, name: true, email: true } },
            productionOrder: {
              select: { id: true, name: true, project: { select: { name: true } } },
            },
          },
        });

        if (existing) {
          const samePayload =
            existing.materialId === input.materialId &&
            existing.movementType === input.movementType &&
            existing.quantity.equals(new Prisma.Decimal(input.quantity)) &&
            (input.unitCost === undefined ||
              existing.unitCost?.equals(new Prisma.Decimal(input.unitCost))) &&
            existing.reference === (input.reference ?? null) &&
            existing.notes === (input.notes ?? null) &&
            existing.productionOrderId === (productionOrderId ?? null);

          if (samePayload) return existing;
          throw new BadRequestException(
            'This event UUID has already been used for a different movement',
          );
        }
      }

      return handlePrismaError(error);
    }
  }

  async updateMovement(
    id: string,
    input: UpdateInventoryMovementDto,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.inventoryMovement.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            materialId: true,
            productionOrderId: true,
            movementType: true,
            quantity: true,
            unitCost: true,
            reference: true,
            notes: true,
          },
        }).catch(handlePrismaError);

        await transaction.$queryRaw`
          SELECT "id" FROM "Material" WHERE "id" = ${existing.materialId} FOR UPDATE
        `;

        const currentMovement = await transaction.inventoryMovement.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            materialId: true,
            productionOrderId: true,
            movementType: true,
            quantity: true,
            unitCost: true,
            reference: true,
            notes: true,
          },
        }).catch(handlePrismaError);
        const quantityChanged =
          input.quantity !== undefined &&
          !new Prisma.Decimal(input.quantity).equals(currentMovement.quantity);
        const unitCostChanged =
          input.unitCost !== undefined &&
          (input.unitCost === null
            ? currentMovement.unitCost !== null
            : !currentMovement.unitCost?.equals(
                new Prisma.Decimal(input.unitCost),
              ));
        if (
          currentMovement.movementType === InventoryMovementType.PURCHASE &&
          (quantityChanged || unitCostChanged)
        ) {
          throw new BadRequestException(
            'Purchase quantity and cost cannot be edited; record a correcting inventory movement',
          );
        }
        if (
          currentMovement.movementType === InventoryMovementType.CONSUMPTION &&
          unitCostChanged
        ) {
          throw new BadRequestException(
            'Consumption cost cannot be edited after it is recorded',
          );
        }
        const quantity = input.quantity ?? Number(currentMovement.quantity);
        if (quantity === 0) {
          throw new BadRequestException('Movement quantity cannot be zero');
        }
        if (
          currentMovement.movementType !== InventoryMovementType.ADJUSTMENT &&
          quantity < 0
        ) {
          throw new BadRequestException(
            'Only adjustment movements can have a negative quantity',
          );
        }

        const otherMovements = await transaction.inventoryMovement.groupBy({
          by: ['movementType'],
          where: { materialId: currentMovement.materialId, id: { not: id } },
          _sum: { quantity: true },
        });
        const stockWithoutMovement = otherMovements.reduce(
          (stock, movement) => {
            const movementQuantity =
              movement._sum.quantity ?? new Prisma.Decimal(0);
            switch (movement.movementType) {
              case InventoryMovementType.PURCHASE:
              case InventoryMovementType.RETURN:
              case InventoryMovementType.ADJUSTMENT:
                return stock.add(movementQuantity);
              case InventoryMovementType.EXIT:
              case InventoryMovementType.CONSUMPTION:
                return stock.sub(movementQuantity);
            }
          },
          new Prisma.Decimal(0),
        );
        const updatedQuantity = new Prisma.Decimal(quantity);
        const stockAfterUpdate =
          currentMovement.movementType === InventoryMovementType.PURCHASE ||
          currentMovement.movementType === InventoryMovementType.RETURN ||
          currentMovement.movementType === InventoryMovementType.ADJUSTMENT
            ? stockWithoutMovement.add(updatedQuantity)
            : stockWithoutMovement.sub(updatedQuantity);

        if (stockAfterUpdate.lessThan(0)) {
          throw new BadRequestException('Inventario insuficiente');
        }

        const updated = await transaction.inventoryMovement
          .update({
            where: { id },
            data: {
              quantity,
              ...(input.unitCost !== undefined && { unitCost: input.unitCost }),
              ...(input.reference !== undefined && { reference: input.reference }),
              ...(input.notes !== undefined && { notes: input.notes }),
              updatedById: userId,
            },
            include: {
              material: { select: { id: true, name: true, unit: true } },
              createdBy: { select: { id: true, name: true, email: true } },
              updatedBy: { select: { id: true, name: true, email: true } },
              productionOrder: {
                select: {
                  id: true,
                  name: true,
                  project: { select: { name: true } },
                },
              },
            },
          })
          .catch(handlePrismaError);
        await this.auditLog.record(transaction, {
          userId,
          action: 'UPDATE',
          entity: 'InventoryMovement',
          entityId: updated.id,
          before: movementAuditSnapshot(currentMovement),
          after: movementAuditSnapshot(updated),
        });
        return updated;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  findMovements() {
    return this.prisma.inventoryMovement.findMany({
      include: {
        material: {
          select: { id: true, name: true, unit: true },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMovementsPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' as const } },
            { notes: { contains: search, mode: 'insensitive' as const } },
            { material: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const total = await this.prisma.inventoryMovement.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        material: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async getStockLevels() {
    const materials = await this.prisma.material.findMany({
      select: { id: true, name: true, unit: true, minimumStock: true },
      orderBy: { name: 'asc' },
    });
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['materialId', 'movementType'],
      _sum: { quantity: true },
    });
    const stockByMaterial = new Map<string, number>();

    for (const movement of movements) {
      const quantity = Number(movement._sum.quantity ?? 0);
      const sign =
        movement.movementType === InventoryMovementType.PURCHASE ||
        movement.movementType === InventoryMovementType.RETURN
          ? 1
          : movement.movementType === InventoryMovementType.CONSUMPTION ||
              movement.movementType === InventoryMovementType.EXIT
            ? -1
            : 1;
      stockByMaterial.set(
        movement.materialId,
        (stockByMaterial.get(movement.materialId) ?? 0) + sign * quantity,
      );
    }

    return materials.map((material) => {
      const stockActual = stockByMaterial.get(material.id) ?? 0;
      const minimumStock = Number(material.minimumStock);
      return {
        ...material,
        stock_actual: stockActual,
        status: getStockStatus(stockActual, minimumStock),
      };
    });
  }

  async getStockLevelsPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};
    const total = await this.prisma.material.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const materials = await this.prisma.material.findMany({
      where,
      select: { id: true, name: true, unit: true, minimumStock: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    const movements = materials.length
      ? await this.prisma.inventoryMovement.groupBy({
          by: ['materialId', 'movementType'],
          where: { materialId: { in: materials.map(({ id }) => id) } },
          _sum: { quantity: true },
        })
      : [];
    const stockByMaterial = new Map<string, number>();

    for (const movement of movements) {
      const quantity = Number(movement._sum.quantity ?? 0);
      const sign =
        movement.movementType === InventoryMovementType.PURCHASE ||
        movement.movementType === InventoryMovementType.RETURN
          ? 1
          : movement.movementType === InventoryMovementType.CONSUMPTION ||
              movement.movementType === InventoryMovementType.EXIT
            ? -1
            : 1;
      stockByMaterial.set(
        movement.materialId,
        (stockByMaterial.get(movement.materialId) ?? 0) + sign * quantity,
      );
    }

    const items = materials.map((material) => {
      const stockActual = stockByMaterial.get(material.id) ?? 0;
      const minimumStock = Number(material.minimumStock);
      return {
        ...material,
        stock_actual: stockActual,
        status: getStockStatus(stockActual, minimumStock),
      };
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async getMaterialStock(materialId: string) {
    const material = await this.prisma.material
      .findUniqueOrThrow({
        where: { id: materialId },
        select: { id: true, name: true, unit: true, minimumStock: true },
      })
      .catch(handlePrismaError);

    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['movementType'],
      where: { materialId },
      _sum: { quantity: true },
    });

    const stock = movements.reduce((total, movement) => {
      const quantity = Number(movement._sum.quantity ?? 0);
      switch (movement.movementType) {
        case InventoryMovementType.PURCHASE:
        case InventoryMovementType.RETURN:
          return total + quantity;
        case InventoryMovementType.CONSUMPTION:
        case InventoryMovementType.EXIT:
          return total - quantity;
        case InventoryMovementType.ADJUSTMENT:
          return total + quantity;
      }
    }, 0);

    return {
      ...material,
      stock_actual: stock,
      stock,
      status: getStockStatus(stock, Number(material.minimumStock)),
    };
  }

  async getMaterialHistory(materialId: string) {
    await this.prisma.material
      .findUniqueOrThrow({ where: { id: materialId }, select: { id: true } })
      .catch(handlePrismaError);

    return this.prisma.inventoryMovement.findMany({
      where: { materialId },
      include: {
        material: {
          select: { id: true, name: true, unit: true },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
