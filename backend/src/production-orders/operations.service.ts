import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  InventoryMovementType,
  ProjectStatus,
  ProductionOrderStatus,
  PurchaseOrderStatus,
} from '../generated/prisma/enums.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { paginatedResult, type ListQueryDto } from '../common/list-query.dto.js';
import { CreateMaterialConsumptionDto } from './dto/create-material-consumption.dto.js';
import { CreateProductionOrderDto } from './dto/create-production-order.dto.js';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto.js';

const orderInclude = {
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly auditLog: AuditLogService,
  ) {}

  findProductionOrders() {
    return this.prisma.productionOrder
      .findMany({
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      })
      .catch(handlePrismaError);
  }

  async findProductionOrdersPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { project: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const total = await this.prisma.productionOrder.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.productionOrder.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async createProductionOrder(input: CreateProductionOrderDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.productionOrder.create({
          data: input,
          include: orderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'CREATE',
          entity: 'ProductionOrder',
          entityId: created.id,
          after: {
            id: created.id,
            name: created.name,
            description: created.description,
            status: created.status,
            projectId: created.projectId,
          },
        });
        return created;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async updateProductionOrder(
    id: string,
    input: UpdateProductionOrderDto,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.productionOrder
          .findUniqueOrThrow({ where: { id } })
          .catch(handlePrismaError);
        const updated = await transaction.productionOrder.update({
          where: { id },
          data: input,
          include: orderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'UPDATE',
          entity: 'ProductionOrder',
          entityId: updated.id,
          before: {
            id: existing.id,
            name: existing.name,
            description: existing.description,
            status: existing.status,
            projectId: existing.projectId,
          },
          after: {
            id: updated.id,
            name: updated.name,
            description: updated.description,
            status: updated.status,
            projectId: updated.projectId,
          },
        });
        return updated;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async deleteProductionOrder(id: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.productionOrder
          .findUniqueOrThrow({ where: { id } })
          .catch(handlePrismaError);
        const deleted = await transaction.productionOrder.delete({
          where: { id },
          include: orderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'DELETE',
          entity: 'ProductionOrder',
          entityId: deleted.id,
          before: {
            id: existing.id,
            name: existing.name,
            description: existing.description,
            status: existing.status,
            projectId: existing.projectId,
          },
        });
        return deleted;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async getDashboardMetrics() {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const [materials, movements, activeOrders, activeProjects, monthlyConsumptions] =
      await Promise.all([
        this.prisma.material.findMany({
          select: { id: true },
        }),
        this.prisma.inventoryMovement.groupBy({
          by: ['materialId', 'movementType'],
          _sum: { quantity: true },
        }),
        this.prisma.productionOrder.count({
          where: {
            status: {
              in: [
                ProductionOrderStatus.PLANNED,
                ProductionOrderStatus.IN_PROGRESS,
              ],
            },
          },
        }),
        this.prisma.project.count({
          where: { status: ProjectStatus.IN_PROGRESS },
        }),
        this.prisma.inventoryMovement.findMany({
          where: {
            movementType: InventoryMovementType.CONSUMPTION,
            createdAt: { gte: monthStart, lt: nextMonthStart },
          },
          select: { quantity: true, unitCost: true },
        }),
      ]);
    const stockByMaterial = new Map<string, number>();

    for (const movement of movements) {
      const quantity = Number(movement._sum.quantity ?? 0);
      const isEntry =
        movement.movementType === InventoryMovementType.PURCHASE ||
        movement.movementType === InventoryMovementType.RETURN;
      const isExit =
        movement.movementType === InventoryMovementType.EXIT ||
        movement.movementType === InventoryMovementType.CONSUMPTION;
      const signedQuantity = isEntry ? quantity : isExit ? -quantity : quantity;
      stockByMaterial.set(
        movement.materialId,
        (stockByMaterial.get(movement.materialId) ?? 0) + signedQuantity,
      );
    }

    const criticalMaterials = materials.filter(
      (material) => (stockByMaterial.get(material.id) ?? 0) <= 0,
    ).length;
    const monthlyProductionCost = monthlyConsumptions.reduce(
      (total, movement) =>
        total.add(
          new Prisma.Decimal(movement.quantity).mul(
            movement.unitCost ?? new Prisma.Decimal(0),
          ),
        ),
      new Prisma.Decimal(0),
    );

    return {
      criticalMaterials,
      activeOrders,
      monthlyProductionCost,
      monthlyConsumptions: monthlyConsumptions.length,
      activeProjects,
      monthStart,
      nextMonthStart,
    };
  }

  async getExecutiveDashboardMetrics() {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const weekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
      ),
    );
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
    const last30DaysStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
    );
    const nextDayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const consumptionStart =
      monthStart < last30DaysStart ? monthStart : last30DaysStart;
    const consumptionEnd =
      nextMonthStart < nextDayStart ? nextMonthStart : nextDayStart;
    const [
      materials,
      movements,
      orderStatusCounts,
      activeClients,
      activeProjects,
      pendingPurchases,
      orders,
      receiptCount,
      receipts,
      consumptions,
      financialProjects,
      historicalConsumptions,
    ] =
      await Promise.all([
        this.prisma.material.findMany({
          select: {
            id: true,
            name: true,
            unit: true,
            unitCost: true,
            minimumStock: true,
          },
        }),
        this.prisma.inventoryMovement.groupBy({
          by: ['materialId', 'movementType'],
          _sum: { quantity: true },
        }),
        this.prisma.productionOrder.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.client.count({
          where: {
            projects: {
              some: { status: ProjectStatus.IN_PROGRESS },
            },
          },
        }),
        this.prisma.project.count({
          where: { status: ProjectStatus.IN_PROGRESS },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            status: {
              in: [
                PurchaseOrderStatus.DRAFT,
                PurchaseOrderStatus.ORDERED,
                PurchaseOrderStatus.PARTIALLY_RECEIVED,
              ],
            },
          },
        }),
        this.prisma.purchaseOrder.findMany({
          where: {
            status: {
              in: ['ORDERED', 'PARTIALLY_RECEIVED'],
            },
          },
          select: {
            status: true,
            expectedAt: true,
            items: {
              select: {
                quantity: true,
                receivedQuantity: true,
              },
            },
          },
        }),
        this.prisma.purchaseReceipt.count({
          where: { createdAt: { gte: weekStart, lt: nextWeekStart } },
        }),
        this.prisma.purchaseReceipt.findMany({
          where: { createdAt: { gte: monthStart, lt: nextMonthStart } },
          include: {
            purchaseOrder: {
              select: {
                supplierId: true,
                supplier: { select: { name: true } },
              },
            },
            items: {
              select: {
                quantity: true,
                unitCost: true,
                purchaseOrderItem: {
                  select: {
                    materialId: true,
                    material: { select: { id: true, name: true, unit: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.inventoryMovement.findMany({
          where: {
            movementType: InventoryMovementType.CONSUMPTION,
            createdAt: { gte: consumptionStart, lt: consumptionEnd },
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
        }),
        this.prisma.project.findMany({
          select: { id: true, name: true, estimatedRevenue: true },
        }),
        this.prisma.inventoryMovement.findMany({
          where: {
            movementType: InventoryMovementType.CONSUMPTION,
            productionOrderId: { not: null },
          },
          select: {
            quantity: true,
            unitCost: true,
            productionOrder: {
              select: {
                project: { select: { id: true } },
              },
            },
          },
        }),
      ]);
    const orderCounts = new Map(
      orderStatusCounts.map((entry) => [entry.status, entry._count._all]),
    );
    const productionStatusBreakdown = Object.values(ProductionOrderStatus).map(
      (status) => ({ status, count: orderCounts.get(status) ?? 0 }),
    );
    const activeOrders =
      (orderCounts.get(ProductionOrderStatus.PLANNED) ?? 0)
      + (orderCounts.get(ProductionOrderStatus.IN_PROGRESS) ?? 0);
    const cancelledProductionOrders =
      orderCounts.get(ProductionOrderStatus.CANCELLED) ?? 0;
    const monthlyConsumptions = consumptions.filter(
      (movement) =>
        movement.createdAt >= monthStart &&
        movement.createdAt < nextMonthStart,
    );
    const recentConsumptions = consumptions.filter(
      (movement) =>
        movement.createdAt >= last30DaysStart &&
        movement.createdAt < nextDayStart,
    );

    const stockByMaterial = new Map<string, Prisma.Decimal>();
    for (const movement of movements) {
      const quantity = movement._sum.quantity ?? new Prisma.Decimal(0);
      const isEntry =
        movement.movementType === InventoryMovementType.PURCHASE ||
        movement.movementType === InventoryMovementType.RETURN;
      const isExit =
        movement.movementType === InventoryMovementType.EXIT ||
        movement.movementType === InventoryMovementType.CONSUMPTION;
      stockByMaterial.set(
        movement.materialId,
        (stockByMaterial.get(movement.materialId) ?? new Prisma.Decimal(0)).add(
          isEntry ? quantity : isExit ? quantity.negated() : quantity,
        ),
      );
    }
    const criticalMaterials = materials.filter(
      (material) =>
        (stockByMaterial.get(material.id) ?? new Prisma.Decimal(0)).lessThanOrEqualTo(0),
    ).length;
    const lowStockMaterials = materials.filter((material) => {
      const stock = stockByMaterial.get(material.id) ?? new Prisma.Decimal(0);
      return (
        stock.greaterThan(0) &&
        stock.lessThanOrEqualTo(material.minimumStock)
      );
    }).length;
    const inventoryCost = materials.reduce(
      (total, material) =>
        total.add(
          (stockByMaterial.get(material.id) ?? new Prisma.Decimal(0)).mul(
            material.unitCost,
          ),
        ),
      new Prisma.Decimal(0),
    );
    const ordersAwaitingReceipt = orders.filter(
      (order) =>
        order.items.some((item) =>
          new Prisma.Decimal(item.quantity).greaterThan(item.receivedQuantity),
        ),
    );
    const pendingReceipts = ordersAwaitingReceipt.length;
    const overduePurchaseOrders = ordersAwaitingReceipt.filter(
      (order) => order.expectedAt !== null && order.expectedAt < now,
    ).length;
    const monthlyProductionCost = monthlyConsumptions.reduce(
      (total, movement) =>
        total.add(
          new Prisma.Decimal(movement.quantity).mul(
            movement.unitCost ?? new Prisma.Decimal(0),
          ),
        ),
      new Prisma.Decimal(0),
    );
    const estimatedSales = financialProjects.reduce(
      (total, project) => total.add(project.estimatedRevenue),
      new Prisma.Decimal(0),
    );
    const historicalProjectCosts = new Map<string, Prisma.Decimal>();
    for (const movement of historicalConsumptions) {
      const projectId = movement.productionOrder?.project.id;
      if (!projectId) continue;
      const cost = new Prisma.Decimal(movement.quantity).mul(
        movement.unitCost ?? new Prisma.Decimal(0),
      );
      historicalProjectCosts.set(
        projectId,
        (historicalProjectCosts.get(projectId) ?? new Prisma.Decimal(0)).add(cost),
      );
    }
    const productionCost = Array.from(historicalProjectCosts.values()).reduce(
      (total, cost) => total.add(cost),
      new Prisma.Decimal(0),
    );
    const estimatedProfit = estimatedSales.sub(productionCost);
    const estimatedMargin = estimatedSales.greaterThan(0)
      ? estimatedProfit.div(estimatedSales).mul(100)
      : new Prisma.Decimal(0);
    const averageProductionCostPerProject = historicalProjectCosts.size
      ? productionCost.div(historicalProjectCosts.size)
      : new Prisma.Decimal(0);
    const ordersWithMonthlyConsumptions = new Set(
      monthlyConsumptions
        .map((movement) => movement.productionOrderId)
        .filter((productionOrderId): productionOrderId is string => productionOrderId !== null),
    );
    const averageMonthlyProductionCostPerOrder = ordersWithMonthlyConsumptions.size
      ? monthlyProductionCost.dividedBy(ordersWithMonthlyConsumptions.size)
      : new Prisma.Decimal(0);
    const monthlyPurchases = receipts.reduce(
      (total, receipt) =>
        total.add(
          receipt.items.reduce(
            (receiptTotal, item) =>
              receiptTotal.add(
                new Prisma.Decimal(item.quantity).mul(item.unitCost),
              ),
            new Prisma.Decimal(0),
          ),
        ),
      new Prisma.Decimal(0),
    );
    const materialTotals = new Map<
      string,
      {
        materialId: string;
        material: string;
        unit: string;
        quantity: Prisma.Decimal;
        totalCost: Prisma.Decimal;
      }
    >();
    for (const movement of monthlyConsumptions) {
      const total = materialTotals.get(movement.material.id) ?? {
        materialId: movement.material.id,
        material: movement.material.name,
        unit: movement.material.unit,
        quantity: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
      };
      const quantity = new Prisma.Decimal(movement.quantity);
      total.quantity = total.quantity.add(quantity);
      total.totalCost = total.totalCost.add(
        quantity.mul(movement.unitCost ?? new Prisma.Decimal(0)),
      );
      materialTotals.set(movement.material.id, total);
    }
    const supplierTotals = new Map<
      string,
      { supplierId: string; supplier: string; total: Prisma.Decimal }
    >();
    for (const receipt of receipts) {
      const supplierId = receipt.purchaseOrder.supplierId;
      const supplier = supplierTotals.get(supplierId) ?? {
        supplierId,
        supplier: receipt.purchaseOrder.supplier.name,
        total: new Prisma.Decimal(0),
      };
      for (const item of receipt.items) {
        supplier.total = supplier.total.add(
          new Prisma.Decimal(item.quantity).mul(item.unitCost),
        );
      }
      supplierTotals.set(supplierId, supplier);
    }

    return {
      inventoryCost,
      estimatedSales,
      productionCost,
      estimatedProfit,
      estimatedMargin,
      averageProductionCostPerProject,
      monthlyProductionCost,
      averageMonthlyProductionCostPerOrder,
      monthlyPurchases,
      monthlyConsumptions: monthlyConsumptions.length,
      activeOrders,
      cancelledProductionOrders,
      activeClients,
      activeProjects,
      pendingPurchases,
      criticalMaterials,
      lowStockMaterials,
      overduePurchaseOrders,
      pendingReceipts,
      weeklyReceipts: receiptCount,
      monthStart,
      nextMonthStart,
      topConsumedMaterials: Array.from(materialTotals.values())
        .sort((left, right) => right.totalCost.comparedTo(left.totalCost))
        .slice(0, 10),
      topSuppliers: Array.from(supplierTotals.values())
        .sort((left, right) => right.total.comparedTo(left.total))
        .slice(0, 10),
      monthlyPurchasesBySupplier: Array.from(supplierTotals.values())
        .sort((left, right) => right.total.comparedTo(left.total)),
      monthlyProductionCostsByProject: this.getProjectCosts(monthlyConsumptions),
      consumptionLast30Days: this.getDailyConsumptions(
        recentConsumptions,
        last30DaysStart,
      ),
      productionStatusBreakdown,
      weekStart,
      nextWeekStart,
    };
  }

  private getProjectCosts(
    consumptions: Array<{
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
      productionOrder: {
        project: { id: string; name: string };
      } | null;
    }>,
  ) {
    const projectCosts = new Map<
      string,
      { projectId: string; project: string; totalCost: Prisma.Decimal }
    >();
    for (const movement of consumptions) {
      const project = movement.productionOrder?.project;
      if (!project) continue;

      const total = projectCosts.get(project.id) ?? {
        projectId: project.id,
        project: project.name,
        totalCost: new Prisma.Decimal(0),
      };
      total.totalCost = total.totalCost.add(
        movement.quantity.mul(movement.unitCost ?? new Prisma.Decimal(0)),
      );
      projectCosts.set(project.id, total);
    }

    return Array.from(projectCosts.values()).sort((left, right) =>
      right.totalCost.comparedTo(left.totalCost),
    );
  }

  private getDailyConsumptions(
    consumptions: Array<{
      createdAt: Date;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
    }>,
    start: Date,
  ) {
    const dailyTotals = new Map<
      string,
      { movementCount: number; quantity: Prisma.Decimal; totalCost: Prisma.Decimal }
    >();
    for (const movement of consumptions) {
      const date = movement.createdAt.toISOString().slice(0, 10);
      const total = dailyTotals.get(date) ?? {
        movementCount: 0,
        quantity: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
      };
      total.movementCount += 1;
      total.quantity = total.quantity.add(movement.quantity);
      total.totalCost = total.totalCost.add(
        movement.quantity.mul(movement.unitCost ?? new Prisma.Decimal(0)),
      );
      dailyTotals.set(date, total);
    }

    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      const total = dailyTotals.get(dateKey);
      return {
        date: dateKey,
        movementCount: total?.movementCount ?? 0,
        quantity: total?.quantity ?? new Prisma.Decimal(0),
        totalCost: total?.totalCost ?? new Prisma.Decimal(0),
      };
    });
  }

  findMaterialConsumptions() {
    return this.prisma.inventoryMovement
      .findMany({
        where: {
          movementType: InventoryMovementType.CONSUMPTION,
          productionOrderId: { not: null },
        },
        include: {
          material: { select: { id: true, name: true, unit: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          productionOrder: {
            select: { id: true, name: true, project: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(handlePrismaError);
  }

  async findMaterialConsumptionsPaginated({
    query,
    page,
    pageSize,
  }: ListQueryDto) {
    const search = query?.trim();
    const where = {
      movementType: InventoryMovementType.CONSUMPTION,
      productionOrderId: { not: null },
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { material: { name: { contains: search, mode: 'insensitive' as const } } },
          { productionOrder: { name: { contains: search, mode: 'insensitive' as const } } },
          { productionOrder: { project: { name: { contains: search, mode: 'insensitive' as const } } } },
        ],
      }),
    };
    const total = await this.prisma.inventoryMovement.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        material: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        productionOrder: {
          select: { id: true, name: true, project: { select: { name: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async createMaterialConsumption(
    input: CreateMaterialConsumptionDto,
    userId: string,
  ) {
    return this.inventoryService.createMovement(
      {
        eventUuid: randomUUID(),
        materialId: input.materialId,
        movementType: InventoryMovementType.CONSUMPTION,
        quantity: input.quantity,
        reference: input.reference,
        notes: input.notes,
      },
      userId,
      input.productionOrderId,
    );
  }

  async getCosts() {
    const consumptions = await this.prisma.inventoryMovement
      .findMany({
        where: {
          movementType: InventoryMovementType.CONSUMPTION,
          productionOrderId: { not: null },
        },
        include: {
          material: { select: { id: true, name: true, unit: true } },
          productionOrder: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(handlePrismaError);
    const totals = new Map<
      string,
      {
        productionOrderId: string;
        productionOrder: string;
        projectId: string;
        project: string;
        totalCost: Prisma.Decimal;
      }
    >();
    const entries = consumptions.map((movement) => {
      const quantity = new Prisma.Decimal(movement.quantity);
      const unitCost = new Prisma.Decimal(movement.unitCost ?? 0);
      const totalCost = quantity.mul(unitCost);
      const order = movement.productionOrder;
      if (order) {
        const total = totals.get(order.id) ?? {
          productionOrderId: order.id,
          productionOrder: order.name,
          projectId: order.project.id,
          project: order.project.name,
          totalCost: new Prisma.Decimal(0),
        };
        total.totalCost = total.totalCost.add(totalCost);
        totals.set(order.id, total);
      }
      return {
        id: movement.id,
        productionOrderId: movement.productionOrderId,
        productionOrder: order?.name ?? '',
        projectId: order?.project.id ?? null,
        project: order?.project.name ?? '',
        material: movement.material.name,
        quantity: movement.quantity,
        unit: movement.material.unit,
        unitCost: movement.unitCost,
        totalCost,
        createdAt: movement.createdAt,
      };
    });

    return {
      entries,
      orders: Array.from(totals.values()),
      totalCost: entries.reduce(
        (total, entry) => total.add(entry.totalCost),
        new Prisma.Decimal(0),
      ),
    };
  }
}
