import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  const inventory = {
    getStockLevels: vi.fn(),
    findMovements: vi.fn(),
  };
  const purchasing = {
    getReport: vi.fn(),
    findPurchaseOrders: vi.fn(),
  };
  const operations = {
    getCosts: vi.fn(),
    findProductionOrders: vi.fn(),
    getExecutiveDashboardMetrics: vi.fn(),
  };
  const files = {
    toExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx')),
    toPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-')),
  };
  const service = new ReportsService(
    inventory as never,
    purchasing as never,
    operations as never,
    files as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports production order details', async () => {
    operations.findProductionOrders.mockResolvedValue([
      {
        name: 'Lote 12',
        project: { name: 'Proyecto Norte' },
        status: 'IN_PROGRESS',
        description: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-02T00:00:00Z'),
      },
    ]);

    await service.exportProductionOrders('xlsx');

    expect(files.toExcel).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Órdenes de producción',
        rows: [
          [
            'Lote 12',
            'Proyecto Norte',
            'IN_PROGRESS',
            null,
            '2026-11-01T00:00:00.000Z',
            '2026-11-02T00:00:00.000Z',
          ],
        ],
      }),
    ]);
  });

  it('exports purchase orders and received items', async () => {
    purchasing.findPurchaseOrders.mockResolvedValue([
      {
        id: 'purchase-1',
        supplier: { name: 'Proveedor A' },
        status: 'PARTIALLY_RECEIVED',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        expectedAt: null,
        items: [
          {
            material: { name: 'Acero' },
            quantity: 10,
            receivedQuantity: 4,
            unitCost: 2.5,
          },
        ],
        receipts: [
          {
            createdAt: new Date('2026-11-02T00:00:00Z'),
            receivedBy: null,
            items: [
              {
                purchaseOrderItem: { material: { name: 'Acero' } },
                quantity: 4,
                unitCost: 2.5,
              },
            ],
          },
        ],
      },
    ]);

    await service.exportPurchaseOrders('xlsx');

    expect(files.toExcel).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Órdenes de compra',
          rows: [
            [
              'purchase-1',
              'Proveedor A',
              'PARTIALLY_RECEIVED',
              '2026-11-01T00:00:00.000Z',
              null,
              'Acero',
              10,
              4,
              2.5,
              25,
            ],
          ],
        }),
        expect.objectContaining({
          name: 'Recepciones',
          rows: [
            [
              'purchase-1',
              'Proveedor A',
              '2026-11-02T00:00:00.000Z',
              'Acero',
              4,
              2.5,
              10,
              '',
            ],
          ],
        }),
      ]),
    );
  });

  it('keeps same-named projects separate in project cost totals', async () => {
    operations.getCosts.mockResolvedValue({
      orders: [],
      totalCost: 30,
      entries: [
        {
          projectId: 'project-1',
          project: 'Proyecto compartido',
          productionOrder: 'Orden A',
          material: 'Acero',
          quantity: 4,
          unit: 'kg',
          unitCost: 5,
          totalCost: 20,
          createdAt: new Date('2026-11-01T00:00:00Z'),
        },
        {
          projectId: 'project-2',
          project: 'Proyecto compartido',
          productionOrder: 'Orden B',
          material: 'Madera',
          quantity: 2,
          unit: 'm',
          unitCost: 5,
          totalCost: 10,
          createdAt: new Date('2026-11-02T00:00:00Z'),
        },
      ],
    });

    await service.exportProjectCosts('xlsx');

    expect(files.toExcel).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Costos por proyecto',
          rows: [
            ['Proyecto compartido', 20],
            ['Proyecto compartido', 10],
          ],
        }),
      ]),
    );
  });

  it('exports executive KPIs and supporting breakdowns', async () => {
    operations.getExecutiveDashboardMetrics.mockResolvedValue({
      inventoryCost: 1200,
      monthlyProductionCost: 300,
      averageMonthlyProductionCostPerOrder: 150,
      monthlyPurchases: 500,
      monthlyConsumptions: 8,
      activeOrders: 2,
      cancelledProductionOrders: 0,
      activeClients: 3,
      activeProjects: 4,
      pendingPurchases: 1,
      criticalMaterials: 2,
      lowStockMaterials: 3,
      overduePurchaseOrders: 1,
      pendingReceipts: 2,
      weeklyReceipts: 5,
      monthStart: new Date('2026-11-01T00:00:00Z'),
      nextMonthStart: new Date('2026-12-01T00:00:00Z'),
      weekStart: new Date('2026-11-02T00:00:00Z'),
      nextWeekStart: new Date('2026-11-09T00:00:00Z'),
      topConsumedMaterials: [
        { material: 'Acero', quantity: 6, totalCost: 90 },
      ],
      topSuppliers: [],
      monthlyPurchasesBySupplier: [
        { supplier: 'Proveedor A', total: 500 },
      ],
      monthlyProductionCostsByProject: [
        { project: 'Proyecto Norte', totalCost: 300 },
      ],
      consumptionLast30Days: [
        { date: '2026-11-07', quantity: 6, totalCost: 90 },
      ],
      productionStatusBreakdown: [{ status: 'IN_PROGRESS', count: 2 }],
    });

    await service.exportExecutiveReport('pdf');

    expect(files.toPdf).toHaveBeenCalledWith(
      'Reporte ejecutivo',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Indicadores',
          rows: expect.arrayContaining([
            ['Costo actual de inventario', 1200],
            ['Costo de producción del mes', 300],
          ]),
        }),
        expect.objectContaining({
          name: 'Estados de producción',
          rows: [['IN_PROGRESS', 2]],
        }),
      ]),
    );
  });
});
