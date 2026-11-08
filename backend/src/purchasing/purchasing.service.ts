import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PurchaseOrderStatus } from '../generated/prisma/enums.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { weightedAverageUnitCost } from '../inventory/inventory-cost.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { paginatedResult, type ListQueryDto } from '../common/list-query.dto.js';

const purchaseOrderInclude = {
  supplier: true,
  items: { include: { material: true } },
  receipts: {
    include: {
      receivedBy: { select: { id: true, name: true, email: true } },
      items: { include: { purchaseOrderItem: { include: { material: true } } } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

function orderSnapshot(order: {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  expectedAt: Date | null;
  notes: string | null;
  items: Array<{
    id: string;
    materialId: string;
    quantity: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
  }>;
}) {
  return {
    id: order.id,
    supplierId: order.supplierId,
    status: order.status,
    expectedAt: order.expectedAt?.toISOString() ?? null,
    notes: order.notes,
    items: order.items.map((item) => ({
      id: item.id,
      materialId: item.materialId,
      quantity: item.quantity.toString(),
      receivedQuantity: item.receivedQuantity.toString(),
      unitCost: item.unitCost.toString(),
    })),
  };
}

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findSuppliers() {
    return this.prisma.supplier.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findSuppliersPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { companyName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const total = await this.prisma.supplier.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.supplier.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async createSupplier(input: CreateSupplierDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const supplier = await transaction.supplier.create({ data: input });
        await this.auditLog.record(transaction, {
          userId,
          action: 'CREATE',
          entity: 'Supplier',
          entityId: supplier.id,
          after: {
            id: supplier.id,
            name: supplier.name,
            email: supplier.email,
            phone: supplier.phone,
            companyName: supplier.companyName,
            isActive: supplier.isActive,
          },
        });
        return supplier;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async updateSupplier(id: string, input: UpdateSupplierDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const before = await transaction.supplier
          .findUniqueOrThrow({ where: { id } })
          .catch(handlePrismaError);
        const supplier = await transaction.supplier.update({
          where: { id },
          data: input,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'UPDATE',
          entity: 'Supplier',
          entityId: supplier.id,
          before: {
            name: before.name,
            email: before.email,
            phone: before.phone,
            companyName: before.companyName,
            notes: before.notes,
            isActive: before.isActive,
          },
          after: {
            name: supplier.name,
            email: supplier.email,
            phone: supplier.phone,
            companyName: supplier.companyName,
            notes: supplier.notes,
            isActive: supplier.isActive,
          },
        });
        return supplier;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  findPurchaseOrders() {
    return this.prisma.purchaseOrder.findMany({
      include: purchaseOrderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPurchaseOrdersPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { id: { contains: search, mode: 'insensitive' as const } },
            { supplier: { name: { contains: search, mode: 'insensitive' as const } } },
            { supplier: { companyName: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const total = await this.prisma.purchaseOrder.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.purchaseOrder.findMany({
      where,
      include: purchaseOrderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  findReceivableOrders() {
    return this.prisma.purchaseOrder.findMany({
      where: {
        status: {
          in: [
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
          ],
        },
      },
      include: purchaseOrderInclude,
      orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPurchaseOrder(input: CreatePurchaseOrderDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const supplier = await transaction.supplier.findUniqueOrThrow({
          where: { id: input.supplierId },
          select: { id: true, isActive: true },
        }).catch(handlePrismaError);
        if (!supplier.isActive) {
          throw new BadRequestException('Cannot create an order for an inactive supplier');
        }
        const created = await transaction.purchaseOrder.create({
          data: {
            supplierId: input.supplierId,
            expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined,
            notes: input.notes,
            items: {
              create: input.items.map((item) => ({
                materialId: item.materialId,
                quantity: item.quantity,
                unitCost: item.unitCost,
              })),
            },
          },
          include: purchaseOrderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'CREATE',
          entity: 'PurchaseOrder',
          entityId: created.id,
          after: orderSnapshot(created),
        });
        return created;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async updatePurchaseOrderStatus(
    id: string,
    input: UpdatePurchaseOrderStatusDto,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const before = await transaction.purchaseOrder.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        }).catch(handlePrismaError);
        const canOrder =
          input.status === PurchaseOrderStatus.ORDERED &&
          before.status === PurchaseOrderStatus.DRAFT;
        const canCancel =
          input.status === PurchaseOrderStatus.CANCELLED &&
          (before.status === PurchaseOrderStatus.DRAFT ||
            before.status === PurchaseOrderStatus.ORDERED ||
            before.status === PurchaseOrderStatus.PARTIALLY_RECEIVED);
        if (!canOrder && !canCancel) {
          throw new BadRequestException(
            `Cannot change purchase order from ${before.status} to ${input.status}`,
          );
        }
        const updated = await transaction.purchaseOrder.update({
          where: { id },
          data: { status: input.status },
          include: purchaseOrderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'UPDATE',
          entity: 'PurchaseOrder',
          entityId: updated.id,
          before: orderSnapshot(before),
          after: orderSnapshot(updated),
        });
        return updated;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async receivePurchaseOrder(
    id: string,
    input: ReceivePurchaseOrderDto,
    userId: string,
  ) {
    if (new Set(input.items.map((item) => item.purchaseOrderItemId)).size !== input.items.length) {
      throw new BadRequestException('Each purchase order item can only appear once per receipt');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE
        `;
        const before = await transaction.purchaseOrder.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        }).catch(handlePrismaError);
        if (
          before.status !== PurchaseOrderStatus.ORDERED &&
          before.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
        ) {
          throw new BadRequestException('Only ordered purchase orders can be received');
        }

        const receiptLines = input.items.map((received) => {
          const item = before.items.find(
            (line) => line.id === received.purchaseOrderItemId,
          );
          if (!item) {
            throw new BadRequestException(
              'A received item does not belong to this purchase order',
            );
          }
          const nextQuantity = item.receivedQuantity.add(received.quantity);
          if (nextQuantity.greaterThan(item.quantity)) {
            throw new BadRequestException(
              `Received quantity exceeds the remaining amount for item ${item.id}`,
            );
          }
          return {
            item,
            quantity: new Prisma.Decimal(received.quantity),
            actualUnitCost: new Prisma.Decimal(received.actualUnitCost),
            nextQuantity,
          };
        });

        const materialIds = Array.from(
          new Set(receiptLines.map(({ item }) => item.materialId)),
        ).sort();
        const averageCostChanges: Array<{
          materialId: string;
          before: string;
          after: string;
        }> = [];
        for (const materialId of materialIds) {
          await transaction.$queryRaw`
            SELECT "id" FROM "Material" WHERE "id" = ${materialId} FOR UPDATE
          `;
        }

        for (const materialId of materialIds) {
          const material = await transaction.material.findUniqueOrThrow({
            where: { id: materialId },
            select: { unitCost: true },
          }).catch(handlePrismaError);
          const movements = await transaction.inventoryMovement.groupBy({
            by: ['movementType'],
            where: { materialId },
            _sum: { quantity: true },
          });
          const currentStock = movements.reduce((stock, movement) => {
            const quantity = movement._sum.quantity ?? new Prisma.Decimal(0);
            switch (movement.movementType) {
              case 'PURCHASE':
              case 'RETURN':
              case 'ADJUSTMENT':
                return stock.add(quantity);
              case 'EXIT':
              case 'CONSUMPTION':
                return stock.sub(quantity);
            }
          }, new Prisma.Decimal(0));
          const incoming = receiptLines
            .filter(({ item }) => item.materialId === materialId)
            .map(({ quantity, actualUnitCost }) => ({
              quantity,
              unitCost: actualUnitCost,
            }));
          const nextUnitCost = weightedAverageUnitCost(
            currentStock,
            material.unitCost,
            incoming,
          );
          await transaction.material.update({
            where: { id: materialId },
            data: { unitCost: nextUnitCost },
          });
          averageCostChanges.push({
            materialId,
            before: material.unitCost.toString(),
            after: nextUnitCost.toString(),
          });
        }

        const receipt = await transaction.purchaseReceipt.create({
          data: {
            purchaseOrderId: id,
            receivedById: userId,
            reference: input.reference,
            notes: input.notes,
            items: {
              create: receiptLines.map(({ item, quantity, actualUnitCost }) => ({
                purchaseOrderItemId: item.id,
                quantity,
                unitCost: actualUnitCost,
              })),
            },
          },
          include: {
            items: { include: { purchaseOrderItem: { include: { material: true } } } },
          },
        });

        for (const { item, quantity, actualUnitCost, nextQuantity } of receiptLines) {
          await transaction.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: nextQuantity },
          });
          await transaction.inventoryMovement.create({
            data: {
              eventUuid: randomUUID(),
              materialId: item.materialId,
              purchaseOrderId: id,
              movementType: 'PURCHASE',
              quantity,
              unitCost: actualUnitCost,
              reference: input.reference ?? `PO ${id}`,
              notes: input.notes,
              createdById: userId,
            },
          });
        }

        const updatedQuantities = new Map(
          receiptLines.map(({ item, nextQuantity }) => [item.id, nextQuantity]),
        );
        const allReceived = before.items.every((item) =>
          (updatedQuantities.get(item.id) ?? item.receivedQuantity).equals(
            item.quantity,
          ),
        );
        const updated = await transaction.purchaseOrder.update({
          where: { id },
          data: {
            status: allReceived
              ? PurchaseOrderStatus.RECEIVED
              : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          },
          include: purchaseOrderInclude,
        });
        await this.auditLog.record(transaction, {
          userId,
          action: 'UPDATE',
          entity: 'PurchaseOrder',
          entityId: id,
          before: orderSnapshot(before),
          after: {
            ...orderSnapshot(updated),
            receipt: {
              id: receipt.id,
              reference: receipt.reference,
              items: receiptLines.map(({ item, quantity, actualUnitCost }) => ({
                purchaseOrderItemId: item.id,
                quantity: quantity.toString(),
                actualUnitCost: actualUnitCost.toString(),
              })),
            },
            averageCostChanges,
          },
        });
        return { receipt, purchaseOrder: updated };
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async getMetrics() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const [activeSuppliers, openOrders, overdueOrders, receipts] = await Promise.all([
      this.prisma.supplier.count({ where: { isActive: true } }),
      this.prisma.purchaseOrder.count({
        where: { status: { in: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED] } },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED] },
          expectedAt: { lt: now },
        },
      }),
      this.prisma.purchaseReceipt.findMany({
        where: { createdAt: { gte: monthStart, lt: nextMonthStart } },
        include: { items: true },
      }),
    ]);
    const monthlySpend = receipts.reduce(
      (total, receipt) =>
        total.add(
          receipt.items.reduce(
            (subtotal, item) =>
              subtotal.add(
                new Prisma.Decimal(item.quantity).mul(item.unitCost),
              ),
            new Prisma.Decimal(0),
          ),
        ),
      new Prisma.Decimal(0),
    );
    return {
      activeSuppliers,
      openOrders,
      overdueOrders,
      monthlyReceipts: receipts.length,
      monthlySpend,
      monthStart,
      nextMonthStart,
    };
  }

  async getReport() {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const [receipts, openOrders, overdueReceipts] = await Promise.all([
      this.prisma.purchaseReceipt.findMany({
        include: {
          purchaseOrder: { include: { supplier: true } },
          items: { include: { purchaseOrderItem: { include: { material: true } } } },
        },
        orderBy: { createdAt: 'desc' },
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
      this.prisma.purchaseOrder.count({
        where: {
          status: {
            in: [
              PurchaseOrderStatus.ORDERED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ],
          },
          expectedAt: { lt: now },
        },
      }),
    ]);
    const suppliers = new Map<string, { supplierId: string; supplier: string; total: Prisma.Decimal; receipts: number }>();
    const materials = new Map<string, { materialId: string; material: string; quantity: Prisma.Decimal; total: Prisma.Decimal }>();
    const entries = receipts.flatMap((receipt) =>
      receipt.items.map((item) => {
        const line = item.purchaseOrderItem;
        const amount = new Prisma.Decimal(item.quantity).mul(item.unitCost);
        const supplier = suppliers.get(receipt.purchaseOrder.supplierId) ?? {
          supplierId: receipt.purchaseOrder.supplierId,
          supplier: receipt.purchaseOrder.supplier.name,
          total: new Prisma.Decimal(0),
          receipts: 0,
        };
        supplier.total = supplier.total.add(amount);
        supplier.receipts += 1;
        suppliers.set(supplier.supplierId, supplier);
        const material = materials.get(line.materialId) ?? {
          materialId: line.materialId,
          material: line.material.name,
          quantity: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
        };
        material.quantity = material.quantity.add(item.quantity);
        material.total = material.total.add(amount);
        materials.set(material.materialId, material);
        return {
          receiptId: receipt.id,
          purchaseOrderId: receipt.purchaseOrderId,
          supplierId: receipt.purchaseOrder.supplierId,
          supplier: receipt.purchaseOrder.supplier.name,
          materialId: line.materialId,
          material: line.material.name,
          unit: line.material.unit,
          quantity: item.quantity,
          unitCost: item.unitCost,
          total: amount,
          createdAt: receipt.createdAt,
        };
      }),
    );
    const monthlyEntries = entries.filter(
      (entry) => entry.createdAt >= monthStart && entry.createdAt < nextMonthStart,
    );
    const monthlySpend = monthlyEntries.reduce(
      (total, entry) => total.add(entry.total),
      new Prisma.Decimal(0),
    );
    const monthlySupplierSpend = new Map<string, Prisma.Decimal>();
    const monthlyMaterialSpend = new Map<
      string,
      { materialId: string; material: string; unit: string; total: Prisma.Decimal }
    >();
    for (const entry of monthlyEntries) {
      const currentSupplierSpend =
        monthlySupplierSpend.get(entry.supplierId) ?? new Prisma.Decimal(0);
      monthlySupplierSpend.set(
        entry.supplierId,
        currentSupplierSpend.add(entry.total),
      );
      const currentMaterial = monthlyMaterialSpend.get(entry.materialId) ?? {
        materialId: entry.materialId,
        material: entry.material,
        unit: entry.unit,
        total: new Prisma.Decimal(0),
      };
      currentMaterial.total = currentMaterial.total.add(entry.total);
      monthlyMaterialSpend.set(entry.materialId, currentMaterial);
    }
    const monthlyMaterialRanked = Array.from(monthlyMaterialSpend.values()).sort(
      (left, right) => right.total.comparedTo(left.total),
    );
    return {
      entries,
      suppliers: Array.from(suppliers.values()),
      materials: Array.from(materials.values()),
      totalSpend: entries.reduce(
        (total, entry) => total.add(entry.total),
        new Prisma.Decimal(0),
      ),
      monthlySpend,
      averageSupplierCost: monthlySupplierSpend.size
        ? monthlySpend.div(monthlySupplierSpend.size)
        : new Prisma.Decimal(0),
      topMonthlyMaterial: monthlyMaterialRanked[0] ?? null,
      overdueReceipts,
      openOrders,
      monthStart,
      nextMonthStart,
    };
  }
}
