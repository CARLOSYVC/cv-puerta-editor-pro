import { apiRequest } from './api'

export interface AuditLogEntry {
  id: string
  userId: string | null
  user: { id: string; name: string; email: string } | null
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  entity:
    | 'InventoryMovement'
    | 'ProductionOrder'
    | 'Supplier'
    | 'PurchaseOrder'
    | 'User'
    | 'RolePermission'
  entityId: string
  before: unknown
  after: unknown
  createdAt: string
}

export interface AuditLogFilters {
  entity?: string
  entityId?: string
  search?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogUser {
  id: string
  name: string
}

export interface AuditLogPage {
  entries: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type AuditLogExportFormat = 'xlsx' | 'pdf' | 'csv'

export function getAuditLogs(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<AuditLogPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }
  return apiRequest<AuditLogPage>(`/audit-logs?${query.toString()}`)
}

export function getAuditLogUsers(): Promise<AuditLogUser[]> {
  return apiRequest<AuditLogUser[]>('/audit-logs/users')
}

export async function exportAuditLogs(
  filters: AuditLogFilters,
  format: AuditLogExportFormat,
): Promise<void> {
  const query = new URLSearchParams()
  query.set('format', format)
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }
  const content = await apiRequest<Blob>(`/audit-logs/export?${query.toString()}`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-log.${format}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
