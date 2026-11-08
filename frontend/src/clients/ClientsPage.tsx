import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import {
  createClient,
  deleteClient,
  getPaginatedClients,
  updateClient,
  type Client,
  type ClientInput,
  type ClientListItem,
} from '../services/clients'
import { navigateToProjectIntent } from '../projects/project-navigation'
import { takeGlobalSearchQuery } from '../services/global-search'

const pageSize = 10
const initialForm: ClientInput = { name: '' }

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Ocurrió un error inesperado.'
}

export function ClientsPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [clients, setClients] = useState<ClientListItem[]>([])
  const [form, setForm] = useState<ClientInput>(initialForm)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      getPaginatedClients({ query, page, pageSize })
        .then((result) => {
          if (cancelled) return
          setClients(result.items)
          setTotal(result.total)
          setTotalPages(result.totalPages)
          setPage(result.page)
          setError('')
        })
        .catch((cause: unknown) => {
          if (cancelled) return
          setError(errorMessage(cause))
          if (cause instanceof ApiError && cause.status === 401) {
            sessionStorage.removeItem('access_token')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token, query, page, refreshKey])

  function startCreate() {
    setEditingClient(null)
    setForm(initialForm)
    setError('')
  }

  function startEdit(client: Client) {
    setEditingClient(client)
    setForm({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      companyName: client.companyName ?? '',
      notes: client.notes ?? '',
    })
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const input: ClientInput = {
      name: form.name.trim(),
      companyName: form.companyName?.trim() || undefined,
      email: form.email?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    }
    try {
      if (editingClient) {
        await updateClient(editingClient.id, input)
      } else {
        await createClient(input)
        setPage(1)
      }
      setEditingClient(null)
      setForm(initialForm)
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError && cause.status === 401) {
        sessionStorage.removeItem('access_token')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(client: Client) {
    if (!window.confirm(`¿Eliminar al cliente "${client.name}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setDeletingId(client.id)
    setError('')
    try {
      await deleteClient(client.id)
      if (editingClient?.id === client.id) startCreate()
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setDeletingId('')
    }
  }

  if (!token) {
    return (
      <section className="projects-page">
        <div className="page-heading"><div><div className="eyebrow">VENTAS</div><h1>Clientes</h1><p>Inicia sesión para administrar clientes.</p></div></div>
        <div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#projects">Iniciar sesión</a></div>
      </section>
    )
  }

  return (
    <section aria-labelledby="clients-title" className="projects-page">
      <div className="page-heading">
        <div><div className="eyebrow">VENTAS</div><h1 id="clients-title">Clientes</h1><p>Administra clientes y encuentra registros por nombre, empresa, correo, teléfono o notas.</p></div>
        <button className="project-primary-button" onClick={startCreate} type="button">+ Nuevo cliente</button>
      </div>
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      <form className="supplier-form" onSubmit={(event) => void submit(event)}>
        <div className="supplier-form-heading"><h2>{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h2></div>
        <div className="supplier-fields">
          <label>Nombre<input autoComplete="name" maxLength={120} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Empresa <span className="optional-label">Opcional</span><input maxLength={160} value={form.companyName ?? ''} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label>
          <label>Correo <span className="optional-label">Opcional</span><input autoComplete="email" maxLength={254} type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Teléfono <span className="optional-label">Opcional</span><input autoComplete="tel" maxLength={40} value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="supplier-notes-field">Notas <span className="optional-label">Opcional</span><input maxLength={1000} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        <div className="supplier-form-actions">
          {editingClient && <button className="project-secondary-button" onClick={startCreate} type="button">Cancelar</button>}
          <button className="project-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : editingClient ? 'Guardar cambios' : 'Guardar cliente'}</button>
        </div>
      </form>

      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar clientes"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre, empresa, correo, teléfono o notas…"
            value={query}
          />
        </label>
        <span className="projects-result-count">{total} {total === 1 ? 'cliente' : 'clientes'}</span>
      </div>

      {loading ? <div className="projects-state" role="status">Cargando clientes…</div> : clients.length === 0 ? (
        <div className="projects-state projects-empty-state">
          <h2>{query ? 'Sin resultados' : 'Sin clientes registrados'}</h2>
          <p>{query ? 'Prueba con otro término de búsqueda.' : 'Agrega un cliente para empezar a organizar proyectos.'}</p>
        </div>
      ) : (
        <>
          <div className="projects-table-wrap">
            <table className="projects-table operations-table">
              <thead><tr><th>Cliente</th><th>Empresa</th><th>Correo</th><th>Teléfono</th><th>Proyectos asociados</th><th>Acciones</th></tr></thead>
              <tbody>{clients.map((client) => (
                <tr key={client.id}>
                  <td><div className="project-name">{client.name}</div></td>
                  <td>{client.companyName || '—'}</td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>
                    {client._count.projects === 0 ? 'Sin proyectos' : (
                      <>
                        <div className="client-project-links">
                          {client.projects.map((project) => (
                            <button
                              aria-label={`Ir al detalle del proyecto ${project.name}`}
                              className="project-text-button"
                              key={project.id}
                              onClick={() => navigateToProjectIntent({
                                type: 'view-project',
                                projectId: project.id,
                              })}
                              type="button"
                            >
                              Ver detalle: {project.name}
                            </button>
                          ))}
                        </div>
                        {client._count.projects > client.projects.length && (
                          <div className="project-description">
                            y {client._count.projects - client.projects.length} más
                          </div>
                        )}
                      </>
                    )}
                    <div className="client-project-actions">
                      <button
                        className="project-text-button"
                        onClick={() => navigateToProjectIntent({
                          type: 'view-client',
                          clientId: client.id,
                        })}
                        type="button"
                      >
                        Ver proyectos
                      </button>
                      <button
                        className="project-text-button"
                        onClick={() => navigateToProjectIntent({
                          type: 'create-for-client',
                          clientId: client.id,
                        })}
                        type="button"
                      >
                        Crear proyecto
                      </button>
                    </div>
                  </td>
                  <td className="project-actions">
                    <button className="project-secondary-button" onClick={() => startEdit(client)} type="button">Editar</button>
                    <button className="project-text-button" disabled={deletingId === client.id} onClick={() => void remove(client)} type="button">{deletingId === client.id ? 'Eliminando…' : 'Eliminar'}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <nav aria-label="Paginación de clientes" className="pagination-controls">
            <button className="project-secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} type="button">Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="project-secondary-button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} type="button">Siguiente</button>
          </nav>
        </>
      )}
    </section>
  )
}
