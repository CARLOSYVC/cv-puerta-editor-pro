import { apiRequest } from './api'

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export interface Supplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  notes: string | null
  isActive: boolean
}

export interface SupplierInput {
  name: string
  email?: string
  phone?: string
  companyName?: string
  notes?: string
  isActive?: boolean
}

export interface PaginatedItems<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PurchaseOrderItem {
  id: string
  materialId: string
  material: { id: string; name: string; unit: string }
  quantity: number | string
  receivedQuantity: number | string
  unitCost: number | string
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  supplier: Supplier
  status: PurchaseOrderStatus
  expectedAt: string | null
  notes: string | null
  items: PurchaseOrderItem[]
  receipts: Array<{ id: string; createdAt: string; reference: string | null }>
  createdAt: string
}

export interface PurchasingMetrics {
  activeSuppliers: number
  openOrders: number
  overdueOrders: number
  monthlyReceipts: number
  monthlySpend: number | string
}

export interface PurchasingReport {
  monthlySpend: number | string
  averageSupplierCost: number | string
  topMonthlyMaterial: {
    materialId: string
    material: string
    unit: string
    total: number | string
  } | null
  overdueReceipts: number
  openOrders: number
  monthStart: string
  nextMonthStart: string
  entries: Array<{
    receiptId: string
    purchaseOrderId: string
    supplierId: string
    supplier: string
    materialId: string
    material: string
    unit: string
    quantity: number | string
    unitCost: number | string
    total: number | string
    createdAt: string
  }>
  suppliers: Array<{
    supplierId: string
    supplier: string
    total: number | string
    receipts: number
  }>
  materials: Array<{
    materialId: string
    material: string
    quantity: number | string
    total: number | string
  }>
  totalSpend: number | string
}

export function getSuppliers(): Promise<Supplier[]> {
  return apiRequest<Supplier[]>('/suppliers')
}

export function getPaginatedSuppliers(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedItems<Supplier>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedItems<Supplier>>(`/suppliers/paginated?${params.toString()}`)
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return apiRequest<Supplier>('/suppliers', { method: 'POST', body: input })
}

export function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  return apiRequest<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: input })
}

export function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  return apiRequest<PurchaseOrder[]>('/purchase-orders')
}

export function getPaginatedPurchaseOrders(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedItems<PurchaseOrder>> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedItems<PurchaseOrder>>(
    `/purchase-orders/paginated?${params.toString()}`,
  )
}

export function createPurchaseOrder(input: {
  supplierId: string
  expectedAt?: string
  notes?: string
  items: Array<{ materialId: string; quantity: number; unitCost: number }>
}): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>('/purchase-orders', { method: 'POST', body: input })
}

export function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
  })
}

export function receivePurchaseOrder(
  id: string,
  input: {
    reference?: string
    notes?: string
    items: Array<{
      purchaseOrderItemId: string
      quantity: number
      actualUnitCost?: number
    }>
  },
): Promise<{ receipt: unknown; purchaseOrder: PurchaseOrder }> {
  return apiRequest(`/receiving/orders/${id}/receipts`, {
    method: 'POST',
    body: input,
  })
}

export function getReceivableOrders(): Promise<PurchaseOrder[]> {
  return apiRequest<PurchaseOrder[]>('/receiving/orders')
}

export function getPurchasingMetrics(): Promise<PurchasingMetrics> {
  return apiRequest<PurchasingMetrics>('/purchasing/metrics')
}

export function getPurchasingReport(): Promise<PurchasingReport> {
  return apiRequest<PurchasingReport>('/purchasing/reports')
}
