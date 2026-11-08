import type { UserRole } from './users'

export type AccessModule =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'materials'
  | 'inventory'
  | 'production-orders'
  | 'material-consumption'
  | 'costs'
  | 'audit-log'
  | 'suppliers'
  | 'purchase-orders'
  | 'purchasing-reports'
  | 'user-management'
  | 'receiving'

export type PermissionAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE'

export interface PermissionGrant {
  module: AccessModule
  action: PermissionAction
}

export interface RolePermissions {
  role: UserRole
  permissions: PermissionGrant[]
}

export const permissionActions: PermissionAction[] = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
]

export const accessModules: Array<{ id: AccessModule; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clients', label: 'Clientes' },
  { id: 'projects', label: 'Proyectos' },
  { id: 'materials', label: 'Materiales' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'production-orders', label: 'Órdenes de producción' },
  { id: 'material-consumption', label: 'Consumos' },
  { id: 'costs', label: 'Costos' },
  { id: 'audit-log', label: 'Auditoría' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'purchase-orders', label: 'Órdenes de compra' },
  { id: 'purchasing-reports', label: 'Reportes de compras' },
  { id: 'receiving', label: 'Recepciones' },
  { id: 'user-management', label: 'Gestión de usuarios' },
]

export function hasPermission(
  permissions: readonly PermissionGrant[],
  module: AccessModule,
  action: PermissionAction,
): boolean {
  return permissions.some(
    (permission) => permission.module === module && permission.action === action,
  )
}
