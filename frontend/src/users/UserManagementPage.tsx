import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import {
  getPaginatedUsers,
  getRolePermissions,
  createUser,
  roleLabels,
  updateUserRole,
  updateRolePermissions,
  userRoles,
  type ManagedUser,
  type UserRole,
} from '../services/users'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'
import {
  accessModules,
  permissionActions,
  type AccessModule,
  type PermissionAction,
  type RolePermissions,
} from '../services/permissions'

export function UserManagementPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('VENTAS')
  const [creating, setCreating] = useState(false)
  const [rolePermissions, setRolePermissions] = useState<RolePermissions[]>([])
  const [selectedPermissionRole, setSelectedPermissionRole] = useState<UserRole>('VENTAS')
  const [savingPermissions, setSavingPermissions] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getPaginatedUsers({ query, page, pageSize: 25 }),
      getRolePermissions(),
    ])
      .then(([userResult, permissionsResult]) => {
        if (cancelled) return
        setUsers(userResult.items)
        setTotal(userResult.total)
        setTotalPages(userResult.totalPages)
        setPage(userResult.page)
        setRolePermissions(permissionsResult)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios y permisos.')
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, query, page, refreshKey])

  async function togglePermission(module: AccessModule, action: PermissionAction) {
    if (selectedPermissionRole === 'ADMIN' || savingPermissions) return
    const current = rolePermissions.find((item) => item.role === selectedPermissionRole)?.permissions ?? []
    const enabled = current.some((item) => item.module === module && item.action === action)
    const next = enabled
      ? current.filter((item) => item.module !== module || item.action !== action)
      : [...current, { module, action }]
    setSavingPermissions(true)
    setError('')
    try {
      const updated = await updateRolePermissions(selectedPermissionRole, next)
      setRolePermissions((items) => items.map((item) =>
        item.role === updated.role ? updated : item,
      ))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron actualizar los permisos.')
    } finally {
      setSavingPermissions(false)
    }
  }

  async function changeRole(user: ManagedUser, role: UserRole) {
    setSavingId(user.id)
    setError('')
    try {
      const updated = await updateUserRole(user.id, role)
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item))
      if (updated.id === sessionStorage.getItem('user_id')) {
        sessionStorage.setItem('user_role', updated.role)
        window.dispatchEvent(new Event('auth-changed'))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el rol.')
    } finally {
      setSavingId('')
    }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setPage(Math.max(1, Math.ceil((total + 1) / 25)))
      setRefreshKey((current) => current + 1)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('VENTAS')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.')
    } finally {
      setCreating(false)
    }
  }

  if (!token) {
    return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">ADMINISTRACIÓN</div><h1>Usuarios y roles</h1><p>Inicia sesión con una cuenta ADMIN.</p></div></div></section>
  }

  return (
    <section aria-labelledby="users-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRACIÓN</div><h1 id="users-title">Usuarios y roles</h1><p>Asigna permisos según la responsabilidad de cada usuario.</p></div></div>
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      <form className="supplier-form" onSubmit={(event) => void addUser(event)}>
        <div className="supplier-form-heading"><h2>Crear usuario</h2></div>
        <div className="supplier-fields">
          <label>Nombre<input autoComplete="name" maxLength={120} required value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
          <label>Correo<input autoComplete="email" maxLength={254} required type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
          <label>Contraseña temporal<input autoComplete="new-password" minLength={12} maxLength={128} required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Rol<select value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)}>{userRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
        </div>
        <div className="supplier-form-actions"><button className="project-primary-button" disabled={creating} type="submit">{creating ? 'Creando…' : 'Crear usuario'}</button></div>
      </form>
      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar usuarios"
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre o correo…"
            value={query}
          />
        </label>
        <span className="projects-result-count">{total} usuarios</span>
      </div>
      {loading ? <div className="projects-state" role="status">Cargando usuarios…</div> : (
        <div className="projects-table-wrap">
          <table className="projects-table operations-table">
            <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Desde</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}>
              <td><div className="project-name">{user.name}</div></td>
              <td>{user.email}</td>
              <td><select aria-label={`Rol de ${user.name}`} className="user-role-select" disabled={savingId === user.id} value={user.role} onChange={(event) => void changeRole(user, event.target.value as UserRole)}>{userRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></td>
              <td>{new Intl.DateTimeFormat('es').format(new Date(user.createdAt))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && (
        <PaginationControls page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
      )}
      <div className="role-description-list">
        <h2>Permisos por rol</h2>
        <p>Configura por módulo las acciones de lectura, creación, actualización y eliminación.</p>
        <label className="permission-role-picker">
          Rol
          <select
            value={selectedPermissionRole}
            onChange={(event) => setSelectedPermissionRole(event.target.value as UserRole)}
          >
            {userRoles.map((role) => (
              <option key={role} value={role}>{roleLabels[role]}</option>
            ))}
          </select>
        </label>
        {selectedPermissionRole === 'ADMIN' && (
          <p>El rol ADMIN conserva acceso completo y no se puede modificar.</p>
        )}
        <div className="projects-table-wrap permissions-table-wrap">
          <table className="projects-table operations-table permissions-table">
            <thead>
              <tr>
                <th scope="col">Módulo</th>
                {permissionActions.map((action) => (
                  <th scope="col" key={action}>{action}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accessModules.map((module) => (
                <tr key={module.id}>
                  <th scope="row">{module.label}</th>
                  {permissionActions.map((action) => {
                    const checked = rolePermissions
                      .find((item) => item.role === selectedPermissionRole)
                      ?.permissions.some((permission) =>
                        permission.module === module.id && permission.action === action,
                      ) ?? false
                    return (
                      <td key={action}>
                        <input
                          aria-label={`${module.label}: ${action}`}
                          checked={checked}
                          disabled={selectedPermissionRole === 'ADMIN' || savingPermissions}
                          onChange={() => void togglePermission(module.id, action)}
                          type="checkbox"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {savingPermissions && <div className="projects-state" role="status">Guardando permisos…</div>}
      </div>
    </section>
  )
}
