import { apiRequest } from './api'
import type { PermissionGrant, RolePermissions } from './permissions'

export type UserRole =
  | 'ADMIN'
  | 'GERENTE'
  | 'VENTAS'
  | 'ALMACEN'
  | 'COMPRAS'
  | 'PRODUCCION'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface ManagedUser extends SessionUser {
  createdAt: string
}

export interface PaginatedUsers {
  items: ManagedUser[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'ADMIN',
  GERENTE: 'GERENTE',
  VENTAS: 'VENTAS',
  ALMACEN: 'ALMACÉN',
  COMPRAS: 'COMPRAS',
  PRODUCCION: 'PRODUCCIÓN',
}

export const userRoles: UserRole[] = [
  'ADMIN',
  'GERENTE',
  'VENTAS',
  'COMPRAS',
  'ALMACEN',
  'PRODUCCION',
]

export function getCurrentUser(): Promise<SessionUser> {
  return apiRequest<SessionUser>('/users/me')
}

export function getCurrentPermissions(): Promise<PermissionGrant[]> {
  return apiRequest<PermissionGrant[]>('/users/me/permissions')
}

export function getRolePermissions(): Promise<RolePermissions[]> {
  return apiRequest<RolePermissions[]>('/users/permissions')
}

export function updateRolePermissions(
  role: UserRole,
  permissions: PermissionGrant[],
): Promise<RolePermissions> {
  return apiRequest<RolePermissions>(`/users/permissions/${role}`, {
    method: 'PATCH',
    body: { permissions },
  })
}

export function getUsers(): Promise<ManagedUser[]> {
  return apiRequest<ManagedUser[]>('/users')
}

export function getPaginatedUsers(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedUsers> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedUsers>(`/users/paginated?${params.toString()}`)
}

export function createUser(input: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<ManagedUser> {
  return apiRequest<ManagedUser>('/users', { method: 'POST', body: input })
}

export function updateUserRole(id: string, role: UserRole): Promise<ManagedUser> {
  return apiRequest<ManagedUser>(`/users/${id}/role`, {
    method: 'PATCH',
    body: { role },
  })
}
