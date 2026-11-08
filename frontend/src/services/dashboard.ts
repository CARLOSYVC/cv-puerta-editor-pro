import { apiRequest } from './api'

export interface DashboardMetrics {
  inventoryCost: number | string
  estimatedSales: number | string
  productionCost: number | string
  estimatedProfit: number | string
  estimatedMargin: number | string
  averageProductionCostPerProject: number | string
  monthlyProductionCost: number | string
  averageMonthlyProductionCostPerOrder: number | string
  monthlyPurchases: number | string
  monthlyConsumptions: number
  activeOrders: number
  cancelledProductionOrders: number
  activeClients: number
  activeProjects: number
  pendingPurchases: number
  criticalMaterials: number
  lowStockMaterials: number
  overduePurchaseOrders: number
  pendingReceipts: number
  topConsumedMaterials: Array<{
    materialId: string
    material: string
    unit: string
    quantity: number | string
    totalCost: number | string
  }>
  topSuppliers: Array<{
    supplierId: string
    supplier: string
    total: number | string
  }>
  monthlyPurchasesBySupplier: Array<{
    supplierId: string
    supplier: string
    total: number | string
  }>
  monthlyProductionCostsByProject: Array<{
    projectId: string
    project: string
    totalCost: number | string
  }>
  consumptionLast30Days: Array<{
    date: string
    movementCount: number
    quantity: number | string
    totalCost: number | string
  }>
  productionStatusBreakdown: Array<{
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    count: number
  }>
  monthStart: string
  nextMonthStart: string
  weeklyReceipts: number
  weekStart: string
  nextWeekStart: string
}

export function getDashboardMetrics(): Promise<DashboardMetrics> {
  return apiRequest<DashboardMetrics>('/dashboard/executive-metrics')
}
