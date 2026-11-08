import { apiRequest } from './api'

export type InventoryMovementType =
  | 'PURCHASE'
  | 'EXIT'
  | 'CONSUMPTION'
  | 'ADJUSTMENT'
  | 'RETURN'

export interface InventoryMovement {
  id: string
  eventUuid: string
  materialId: string
  movementType: InventoryMovementType
  quantity: number | string
  unitCost: number | string | null
  reference: string | null
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string; email: string } | null
  updatedBy: { id: string; name: string; email: string } | null
  material: {
    id: string
    name: string
    unit: string
  }
}

export interface InventoryStockLevel {
  id: string
  name: string
  unit: string
  minimumStock: number | string
  stock_actual: number
  status: 'CRITICAL' | 'LOW_STOCK' | 'IN_STOCK'
}

export interface PaginatedInventoryItems<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateInventoryMovementInput {
  eventUuid: string
  materialId: string
  movementType: Exclude<InventoryMovementType, 'CONSUMPTION'>
  quantity: number
  unitCost?: number
  reference?: string
  notes?: string
}

export interface UpdateInventoryMovementInput {
  quantity: number
  unitCost: number | null
  reference: string | null
  notes: string | null
}

export function getInventoryMovements(): Promise<InventoryMovement[]> {
  return apiRequest<InventoryMovement[]>('/inventory/movements')
}

export function getPaginatedInventoryMovements(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedInventoryItems<InventoryMovement>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedInventoryItems<InventoryMovement>>(
    `/inventory/movements/paginated?${params.toString()}`,
  )
}

export function getInventoryStock(): Promise<InventoryStockLevel[]> {
  return apiRequest<InventoryStockLevel[]>('/inventory/stock')
}

export function getPaginatedInventoryStock(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedInventoryItems<InventoryStockLevel>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedInventoryItems<InventoryStockLevel>>(
    `/inventory/stock/paginated?${params.toString()}`,
  )
}

export function createInventoryMovement(
  input: CreateInventoryMovementInput,
): Promise<InventoryMovement> {
  return apiRequest<InventoryMovement>('/inventory/movements', {
    method: 'POST',
    body: input,
  })
}

export function updateInventoryMovement(
  id: string,
  input: UpdateInventoryMovementInput,
): Promise<InventoryMovement> {
  return apiRequest<InventoryMovement>(`/inventory/movements/${id}`, {
    method: 'PATCH',
    body: input,
  })
}
