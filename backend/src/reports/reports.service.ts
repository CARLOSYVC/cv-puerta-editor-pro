import { Injectable } from '@nestjs/common';
import { InventoryService } from '../inventory/inventory.service.js';
import { OperationsService } from '../production-orders/operations.service.js';
import { PurchasingService } from '../purchasing/purchasing.service.js';
import {
  ReportFileService,
  type ReportSheet,
} from './report-file.service.js';

export type ReportExportFormat = 'xlsx' | 'pdf';

@Injectable()
export class ReportsService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly purchasing: PurchasingService,
    private readonly operations: OperationsService,
    private readonly files: ReportFileService,
  ) {}

  async exportInventory(format: ReportExportFormat): Promise<Buffer> {
    const [stock, movements] = await Promise.all([
      this.inventory.getStockLevels(),
      this.inventory.findMovements(),
    ]);
    const sheets: ReportSheet[] = [
      {
        name: 'Existencias',
        columns: ['Material', 'Stock actual', 'Unidad', 'Stock mínimo', 'Estado'],
        rows: stock.map((item) => [
          item.name,
          item.stock_actual,
          item.unit,
          Number(item.minimumStock),
          item.status,
        ]),
      },
      {
        name: 'Movimientos',
        columns: [
          'Fecha',
          'Material',
          'Tipo',
          'Cantidad',
          'Unidad',
          'Costo unitario',
          'Referencia',
          'Creado por',
          'Actualizado por',
        ],
        rows: movements.map((movement) => [
          movement.createdAt.toISOString(),
          movement.material.name,
          movement.movementType,
          Number(movement.quantity),
          movement.material.unit,
          movement.unitCost === null ? null : Number(movement.unitCost),
          movement.reference,
          movement.createdBy?.name ?? movement.createdBy?.email ?? '',
          movement.updatedBy?.name ?? movement.updatedBy?.email ?? '',
        ]),
      },
    ];
    return this.render('Inventario', format, sheets);
  }

  async exportPurchases(format: ReportExportFormat): Promise<Buffer> {
    const report = await this.purchasing.getReport();
    const sheets: ReportSheet[] = [
      {
        name: 'Compras recibidas',
        columns: [
          'Orden',
          'Proveedor',
          'Material',
          'Cantidad',
          'Unidad',
          'Costo unitario real',
          'Total',
          'Fecha',
        ],
        rows: report.entries.map((entry) => [
          entry.purchaseOrderId,
          entry.supplier,
          entry.material,
          Number(entry.quantity),
          entry.unit,
          Number(entry.unitCost),
          Number(entry.total),
          entry.createdAt.toISOString(),
        ]),
      },
      {
        name: 'Totales por proveedor',
        columns: ['Proveedor', 'Recepciones', 'Total recibido'],
        rows: report.suppliers.map((supplier) => [
          supplier.supplier,
          supplier.receipts,
          Number(supplier.total),
        ]),
      },
      {
        name: 'Totales por material',
        columns: ['Material', 'Cantidad', 'Total recibido'],
        rows: report.materials.map((material) => [
          material.material,
          Number(material.quantity),
          Number(material.total),
        ]),
      },
    ];
    return this.render('Compras', format, sheets);
  }

  async exportCosts(format: ReportExportFormat): Promise<Buffer> {
    const report = await this.operations.getCosts();
    const sheets: ReportSheet[] = [
      {
        name: 'Costos por orden',
        columns: ['Orden de producción', 'Proyecto', 'Costo total'],
        rows: report.orders.map((order) => [
          order.productionOrder,
          order.project,
          Number(order.totalCost),
        ]),
      },
      {
        name: 'Detalle de costos',
        columns: [
          'Orden',
          'Proyecto',
          'Material',
          'Cantidad',
          'Unidad',
          'Costo unitario',
          'Costo total',
          'Fecha',
        ],
        rows: report.entries.map((entry) => [
          entry.productionOrder,
          entry.project,
          entry.material,
          Number(entry.quantity),
          entry.unit,
          entry.unitCost === null ? null : Number(entry.unitCost),
          Number(entry.totalCost),
          entry.createdAt.toISOString(),
        ]),
      },
    ];
    return this.render('Costos', format, sheets);
  }

  async exportProductionOrders(format: ReportExportFormat): Promise<Buffer> {
    const orders = await this.operations.findProductionOrders();
    const sheets: ReportSheet[] = [
      {
        name: 'Órdenes de producción',
        columns: [
          'Orden',
          'Proyecto',
          'Estado',
          'Descripción',
          'Creada',
          'Actualizada',
        ],
        rows: orders.map((order) => [
          order.name,
          order.project.name,
          order.status,
          order.description,
          order.createdAt.toISOString(),
          order.updatedAt.toISOString(),
        ]),
      },
    ];
    return this.render('Órdenes de producción', format, sheets);
  }

  async exportPurchaseOrders(format: ReportExportFormat): Promise<Buffer> {
    const orders = await this.purchasing.findPurchaseOrders();
    const sheets: ReportSheet[] = [
      {
        name: 'Órdenes de compra',
        columns: [
          'Orden',
          'Proveedor',
          'Estado',
          'Creada',
          'Entrega esperada',
          'Material',
          'Cantidad ordenada',
          'Cantidad recibida',
          'Costo unitario',
          'Subtotal ordenado',
        ],
        rows: orders.flatMap((order) =>
          order.items.length
            ? order.items.map((item) => [
                order.id,
                order.supplier.name,
                order.status,
                order.createdAt.toISOString(),
                order.expectedAt?.toISOString() ?? null,
                item.material.name,
                Number(item.quantity),
                Number(item.receivedQuantity),
                Number(item.unitCost),
                Number(item.quantity) * Number(item.unitCost),
              ])
            : [[
                order.id,
                order.supplier.name,
                order.status,
                order.createdAt.toISOString(),
                order.expectedAt?.toISOString() ?? null,
                null,
                null,
                null,
                null,
                null,
              ]],
        ),
      },
      {
        name: 'Recepciones',
        columns: [
          'Orden',
          'Proveedor',
          'Fecha de recepción',
          'Material',
          'Cantidad recibida',
          'Costo unitario real',
          'Total recibido',
          'Recibido por',
        ],
        rows: orders.flatMap((order) =>
          order.receipts.flatMap((receipt) =>
            receipt.items.map((item) => [
              order.id,
              order.supplier.name,
              receipt.createdAt.toISOString(),
              item.purchaseOrderItem.material.name,
              Number(item.quantity),
              Number(item.unitCost),
              Number(item.quantity) * Number(item.unitCost),
              receipt.receivedBy?.name ?? receipt.receivedBy?.email ?? '',
            ]),
          ),
        ),
      },
    ];
    return this.render('Órdenes de compra', format, sheets);
  }

  async exportProjectCosts(format: ReportExportFormat): Promise<Buffer> {
    const report = await this.operations.getCosts();
    const projectTotals = new Map<string, { project: string; totalCost: number }>();
    for (const entry of report.entries) {
      if (entry.projectId === null) continue;
      const current = projectTotals.get(entry.projectId) ?? {
        project: entry.project,
        totalCost: 0,
      };
      current.totalCost += Number(entry.totalCost);
      projectTotals.set(entry.projectId, current);
    }
    const sheets: ReportSheet[] = [
      {
        name: 'Costos por proyecto',
        columns: ['Proyecto', 'Costo total'],
        rows: Array.from(projectTotals.values())
          .map(({ project, totalCost }) => [project, totalCost])
          .sort((left, right) => Number(right[1]) - Number(left[1])),
      },
      {
        name: 'Detalle',
        columns: [
          'Proyecto',
          'Orden de producción',
          'Material',
          'Cantidad',
          'Unidad',
          'Costo unitario',
          'Costo total',
          'Fecha',
        ],
        rows: report.entries.map((entry) => [
          entry.project,
          entry.productionOrder,
          entry.material,
          Number(entry.quantity),
          entry.unit,
          entry.unitCost === null ? null : Number(entry.unitCost),
          Number(entry.totalCost),
          entry.createdAt.toISOString(),
        ]),
      },
    ];
    return this.render('Costos por proyecto', format, sheets);
  }

  async exportExecutiveReport(format: ReportExportFormat): Promise<Buffer> {
    const report = await this.operations.getExecutiveDashboardMetrics();
    const sheets: ReportSheet[] = [
      {
        name: 'Indicadores',
        columns: ['Indicador', 'Valor'],
        rows: [
          ['Costo actual de inventario', Number(report.inventoryCost)],
          ['Ventas estimadas', Number(report.estimatedSales)],
          ['Costo de producción histórico', Number(report.productionCost)],
          ['Utilidad estimada', Number(report.estimatedProfit)],
          ['Margen estimado (%)', Number(report.estimatedMargin)],
          [
            'Costo promedio por proyecto',
            Number(report.averageProductionCostPerProject),
          ],
          ['Costo de producción del mes', Number(report.monthlyProductionCost)],
          ['Compras del mes', Number(report.monthlyPurchases)],
          ['Consumos del mes', report.monthlyConsumptions],
          ['Órdenes activas', report.activeOrders],
          ['Clientes activos', report.activeClients],
          ['Proyectos activos', report.activeProjects],
          ['Compras pendientes', report.pendingPurchases],
          ['Materiales críticos', report.criticalMaterials],
          ['Materiales con stock bajo', report.lowStockMaterials],
          ['Compras atrasadas', report.overduePurchaseOrders],
          ['Recepciones pendientes', report.pendingReceipts],
          ['Recepciones de la semana', report.weeklyReceipts],
          [
            'Costo promedio por orden del mes',
            Number(report.averageMonthlyProductionCostPerOrder),
          ],
        ],
      },
      {
        name: 'Estados de producción',
        columns: ['Estado', 'Órdenes'],
        rows: report.productionStatusBreakdown.map((item) => [
          item.status,
          item.count,
        ]),
      },
      {
        name: 'Materiales consumidos',
        columns: ['Material', 'Cantidad', 'Costo total'],
        rows: report.topConsumedMaterials.map((item) => [
          item.material,
          Number(item.quantity),
          Number(item.totalCost),
        ]),
      },
      {
        name: 'Compras por proveedor',
        columns: ['Proveedor', 'Total'],
        rows: report.monthlyPurchasesBySupplier.map((item) => [
          item.supplier,
          Number(item.total),
        ]),
      },
      {
        name: 'Costos por proyecto',
        columns: ['Proyecto', 'Costo total'],
        rows: report.monthlyProductionCostsByProject.map((item) => [
          item.project,
          Number(item.totalCost),
        ]),
      },
      {
        name: 'Consumos últimos 30 días',
        columns: ['Fecha', 'Cantidad', 'Costo total'],
        rows: report.consumptionLast30Days.map((item) => [
          item.date,
          Number(item.quantity),
          Number(item.totalCost),
        ]),
      },
    ];
    return this.render('Reporte ejecutivo', format, sheets);
  }

  private render(
    title: string,
    format: ReportExportFormat,
    sheets: ReportSheet[],
  ): Promise<Buffer> {
    return format === 'xlsx'
      ? this.files.toExcel(sheets)
      : this.files.toPdf(title, sheets);
  }
}
