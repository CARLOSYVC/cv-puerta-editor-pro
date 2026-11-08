import { type FormEvent, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import {
  exportAuditLogs,
  getAuditLogUsers,
  getAuditLogs,
  type AuditLogEntry,
  type AuditLogExportFormat,
  type AuditLogFilters,
  type AuditLogUser,
} from '../services/audit-log'

const actionLabels: Record<AuditLogEntry['action'], string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
}

const entityLabels: Record<AuditLogEntry['entity'], string> = {
  InventoryMovement: 'Movimiento de inventario',
  ProductionOrder: 'Orden de producción',
  Supplier: 'Proveedor',
  PurchaseOrder: 'Orden de compra',
  User: 'Usuario',
  RolePermission: 'Permisos por rol',
}

const entities = Object.keys(entityLabels) as AuditLogEntry['entity'][]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function AuditLogPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [users, setUsers] = useState<AuditLogUser[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [entity, setEntity] = useState('')
  const [entityId, setEntityId] = useState('')
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<AuditLogExportFormat>('xlsx')

  useEffect(() => {
    if (!token) return

    let cancelled = false
    getAuditLogs(filters, page, pageSize)
      .then((result) => {
        if (cancelled) return
        setEntries(result.entries)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar el registro de auditoría.',
        )
        if (cause instanceof ApiError && cause.status === 401) {
          sessionStorage.removeItem('access_token')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, filters, page, pageSize])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getAuditLogUsers()
      .then((result) => {
        if (!cancelled) setUsers(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar los usuarios del registro.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFilters = {
      entity,
      entityId: entityId.trim(),
      search: search.trim(),
      userId,
      dateFrom,
      dateTo,
    }
    if (JSON.stringify(filters) !== JSON.stringify(nextFilters) || page !== 1) {
      setLoading(true)
      setError('')
      setPage(1)
      setFilters(nextFilters)
    }
  }

  function clearFilters() {
    setEntity('')
    setEntityId('')
    setSearch('')
    setUserId('')
    setDateFrom('')
    setDateTo('')
    if (Object.values(filters).some(Boolean) || page !== 1) {
      setLoading(true)
      setError('')
      setPage(1)
      setFilters({})
    }
  }

  async function downloadExport() {
    setExporting(true)
    setError('')
    try {
      await exportAuditLogs(filters, exportFormat)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar la auditoría.')
    } finally {
      setExporting(false)
    }
  }

  function changePage(nextPage: number) {
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  if (!token) {
    return (
      <section className="projects-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">CONTROL</div>
            <h1>Registro de auditoría</h1>
            <p>Inicia sesión para consultar la actividad.</p>
          </div>
        </div>
        <div className="projects-state projects-empty-state">
          <a className="project-primary-button inventory-sign-in" href="#materials">
            Ir a Materials para iniciar sesión
          </a>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="audit-log-title" className="projects-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONTROL</div>
          <h1 id="audit-log-title">Registro de auditoría</h1>
          <p>Consulta, filtra y exporta la actividad registrada.</p>
        </div>
      </div>
      {error && (
        <div className="projects-error projects-page-error" role="alert">
          {error}
        </div>
      )}
      <form className="audit-filters" onSubmit={applyFilters}>
        <label>
          Búsqueda
          <input
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Usuario, acción o ID…"
            value={search}
          />
        </label>
        <label>
          Entidad
          <select value={entity} onChange={(event) => setEntity(event.target.value)}>
            <option value="">Todas</option>
            {entities.map((item) => (
              <option key={item} value={item}>{entityLabels[item]}</option>
            ))}
          </select>
        </label>
        <label>
          Usuario
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Todos</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <label>
          ID
          <input
            autoComplete="off"
            onChange={(event) => setEntityId(event.target.value)}
            placeholder="ID de la entidad"
            value={entityId}
          />
        </label>
        <label>
          Desde
          <input
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label>
          Hasta
          <input
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            type="date"
            value={dateTo}
          />
        </label>
        <button className="project-primary-button" type="submit">Filtrar</button>
        <button className="project-text-button" onClick={clearFilters} type="button">
          Limpiar
        </button>
        <label>
          Formato
          <select
            onChange={(event) => setExportFormat(event.target.value as AuditLogExportFormat)}
            value={exportFormat}
          >
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <button
          className="project-primary-button audit-export-button"
          disabled={exporting}
          onClick={() => void downloadExport()}
          type="button"
        >
          {exporting ? 'Exportando…' : 'Exportar'}
        </button>
      </form>
      {loading ? (
        <div className="projects-state" role="status">
          Cargando registro…
        </div>
      ) : entries.length === 0 ? (
        <div className="projects-state projects-empty-state">
          <h2>{Object.values(filters).some(Boolean) ? 'Sin resultados' : 'Sin actividad registrada'}</h2>
          <p>{Object.values(filters).some(Boolean)
            ? 'No hay registros que coincidan con los filtros.'
            : 'Los cambios aparecerán aquí cuando se realicen.'}</p>
        </div>
      ) : (
        <>
          <div className="projects-table-wrap">
            <table className="projects-table operations-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>ID</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.user?.name ?? 'Usuario eliminado'}</td>
                    <td>{actionLabels[entry.action] ?? entry.action}</td>
                    <td>{entityLabels[entry.entity] ?? entry.entity}</td>
                    <td>{entry.entityId}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="audit-pagination">
            <span>{total} registros</span>
            <label>
              Por página
              <select
                onChange={(event) => {
                  setLoading(true)
                  setPage(1)
                  setPageSize(Number(event.target.value))
                }}
                value={pageSize}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <span>Página {page} de {totalPages}</span>
            <button
              className="project-text-button"
              disabled={page <= 1 || loading}
              onClick={() => changePage(page - 1)}
              type="button"
            >
              Anterior
            </button>
            <button
              className="project-text-button"
              disabled={page >= totalPages || loading}
              onClick={() => changePage(page + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  )
}
