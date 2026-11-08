import { apiRequest } from './api'

export type ProductionOrderStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export interface ProductionOrder {
  id: string
  name: string
  description: string | null
  status: ProductionOrderStatus
  projectId: string
  project: { id: string; name: string }
  createdAt: string
}

export interface ProductionOrderInput {
  name: string
  description?: string | null
  projectId: string
  status: ProductionOrderStatus
}

export interface OperationMaterial {
  id: string
  name: string
  unit: string
  unitCost: number | string
}

export interface MaterialConsumption {
  id: string
  productionOrderId: string | null
  productionOrder: { id: string; name: string; project: { name: string } } | null
  material: { id: string; name: string; unit: string }
  quantity: number | string
  unitCost: number | string | null
  reference: string | null
  notes: string | null
  createdAt: string
}

export interface CostsReport {
  entries: Array<{
    id: string
    productionOrderId: string | null
    productionOrder: string
    project: string
    material: string
    quantity: number | string
    unit: string
    unitCost: number | string | null
    totalCost: number | string
    createdAt: string
  }>
  orders: Array<{
    productionOrderId: string
    productionOrder: string
    project: string
    totalCost: number | string
  }>
  totalCost: number | string
}

export interface ProjectOption {
  id: string
  name: string
}

export interface PaginatedItems<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function getProductionOrders(): Promise<ProductionOrder[]> {
  return apiRequest<ProductionOrder[]>('/production-orders')
}

export function getPaginatedProductionOrders(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedItems<ProductionOrder>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedItems<ProductionOrder>>(
    `/production-orders/paginated?${params.toString()}`,
  )
}

export function createProductionOrder(input: ProductionOrderInput): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>('/production-orders', { method: 'POST', body: input })
}

export function updateProductionOrder(
  id: string,
  input: ProductionOrderInput,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/production-orders/${id}`, { method: 'PATCH', body: input })
}

export function deleteProductionOrder(id: string): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/production-orders/${id}`, { method: 'DELETE' })
}

export function getOperationProjects(): Promise<ProjectOption[]> {
  return apiRequest<ProjectOption[]>('/projects')
}

export function getOperationMaterials(): Promise<OperationMaterial[]> {
  return apiRequest<OperationMaterial[]>('/materials')
}

export function getMaterialConsumptions(): Promise<MaterialConsumption[]> {
  return apiRequest<MaterialConsumption[]>('/material-consumption')
}

export function getPaginatedMaterialConsumptions(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedItems<MaterialConsumption>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedItems<MaterialConsumption>>(
    `/material-consumption/paginated?${params.toString()}`,
  )
}

export function createMaterialConsumption(input: {
  productionOrderId: string
  materialId: string
  quantity: number
  reference?: string
  notes?: string
}): Promise<MaterialConsumption> {
  return apiRequest<MaterialConsumption>('/material-consumption', {
    method: 'POST',
    body: input,
  })
}

export function getCosts(): Promise<CostsReport> {
  return apiRequest<CostsReport>('/costs')
}
