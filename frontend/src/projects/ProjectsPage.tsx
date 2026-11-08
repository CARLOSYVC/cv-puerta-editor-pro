import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../services/api'
import {
  createClient,
  getClients,
  type Client,
  type ClientInput,
} from '../services/clients'
import {
  createProject,
  deleteProject as removeProject,
  getPaginatedProjects,
  getProject,
  updateProject,
  type Project,
  type ProjectStatus,
} from '../services/projects'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'
import {
  clearProjectNavigationIntent,
  getProjectNavigationIntent,
  type ProjectNavigationIntent,
} from './project-navigation'
import { navigateToProductionOrder } from '../production-orders/production-order-navigation'

interface AuthResponse {
  access_token: string
  user: {
    id: string
    name: string
    email: string
    role: string
  }
}

interface ProjectInput {
  name: string
  description: string
  status: ProjectStatus
  clientId: string
  estimatedRevenue: string
}

type ProjectEditor = { mode: 'create' } | { mode: 'edit'; project: Project }

const statusLabels: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  ON_HOLD: 'On hold',
}
const projectStatuses = [
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
  'ON_HOLD',
] as const satisfies readonly ProjectStatus[]

const initialProjectInput: ProjectInput = {
  name: '',
  description: '',
  status: 'PLANNING',
  clientId: '',
  estimatedRevenue: '0',
}

const initialClientInput: ClientInput = {
  name: '',
  email: '',
  phone: '',
  companyName: '',
  notes: '',
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatCurrency(value: number | string): string {
  return Number(value).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ProjectsPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('access_token'))
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [navigationIntent] = useState<ProjectNavigationIntent | null>(
    getProjectNavigationIntent,
  )
  const [clientFilterId, setClientFilterId] = useState('')
  const [detailsProject, setDetailsProject] = useState<Project | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [pageError, setPageError] = useState('')
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [editor, setEditor] = useState<ProjectEditor | null>(null)
  const [clientEditorOpen, setClientEditorOpen] = useState(false)
  const [clientForm, setClientForm] = useState<ClientInput>(initialClientInput)
  const [clientFormError, setClientFormError] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [form, setForm] = useState<ProjectInput>(initialProjectInput)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return

    let cancelled = false
    getClients()
      .then((nextClients) => {
        if (cancelled) return
        setClients(nextClients)
        if (navigationIntent) {
          clearProjectNavigationIntent()
          if (navigationIntent.type === 'view-client') {
            setClientFilterId(navigationIntent.clientId)
            setQuery('')
          } else if (navigationIntent.type === 'create-for-client') {
            const clientExists = nextClients.some((client) => client.id === navigationIntent.clientId)
            if (clientExists) {
              setForm({ ...initialProjectInput, clientId: navigationIntent.clientId })
              setFormError('')
              setEditor({ mode: 'create' })
            } else {
              setPageError('No se pudo encontrar el cliente seleccionado para el nuevo proyecto.')
            }
          } else {
            getProject(navigationIntent.projectId)
              .then((project) => {
                if (!cancelled) setDetailsProject(project)
              })
              .catch((error: unknown) => {
                if (!cancelled) setPageError(getErrorMessage(error))
              })
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = getErrorMessage(error)
        setPageError(message)
        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem('access_token')
          sessionStorage.removeItem('user_role')
          sessionStorage.removeItem('user_id')
          window.dispatchEvent(new Event('auth-changed'))
          setAuthNotice('Your session expired. Sign in again to continue.')
          setProjects([])
          setClients([])
          setToken(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [navigationIntent, token])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      getPaginatedProjects({
        query,
        page,
        pageSize: 25,
        clientId: clientFilterId || undefined,
      })
        .then((result) => {
          if (cancelled) return
          setProjects(result.items)
          setTotal(result.total)
          setTotalPages(result.totalPages)
          setPage(result.page)
          setPageError('')
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setPageError(getErrorMessage(error))
          if (error instanceof ApiError && error.status === 401) {
            sessionStorage.removeItem('access_token')
            sessionStorage.removeItem('user_role')
            sessionStorage.removeItem('user_id')
            window.dispatchEvent(new Event('auth-changed'))
            setProjects([])
            setClients([])
            setToken(null)
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
  }, [clientFilterId, page, query, refreshKey, token])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthPending(true)
    setAuthError('')
    setAuthNotice('')

    try {
      const response = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email: authEmail, password: authPassword },
      })
      sessionStorage.setItem('access_token', response.access_token)
      sessionStorage.setItem('user_id', response.user.id)
      sessionStorage.setItem('user_role', response.user.role)
      window.dispatchEvent(new Event('auth-changed'))
      setPageError('')
      setToken(response.access_token)
      setAuthPassword('')
      if (['ADMIN', 'GERENTE', 'VENTAS'].includes(response.user.role)) {
        window.location.hash = 'clients'
      }
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthPending(false)
    }
  }

  function signOut() {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user_role')
    sessionStorage.removeItem('user_id')
    window.dispatchEvent(new Event('auth-changed'))
    setToken(null)
    setProjects([])
    setClients([])
    setClientFilterId('')
    setDetailsProject(null)
    setEditor(null)
    setAuthError('')
    setAuthNotice('')
  }

  function openCreateForm() {
    setForm({ ...initialProjectInput, clientId: clients[0]?.id ?? '' })
    setFormError('')
    setPageError('')
    setEditor({ mode: 'create' })
  }

  function openClientForm() {
    setClientForm(initialClientInput)
    setClientFormError('')
    setClientEditorOpen(true)
  }

  async function handleClientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingClient(true)
    setClientFormError('')
    const input = {
      name: clientForm.name.trim(),
      email: clientForm.email?.trim() || undefined,
      phone: clientForm.phone?.trim() || undefined,
      companyName: clientForm.companyName?.trim() || undefined,
      notes: clientForm.notes?.trim() || undefined,
    }

    try {
      const client = await createClient(input)
      setClients((current) => [client, ...current])
      setForm((current) => ({ ...current, clientId: client.id }))
      setClientEditorOpen(false)
      setPageError('')
    } catch (error) {
      setClientFormError(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('access_token')
        setAuthNotice('Your session expired. Sign in again to continue.')
        setProjects([])
        setClients([])
        setToken(null)
        setEditor(null)
        setClientEditorOpen(false)
      }
    } finally {
      setSavingClient(false)
    }
  }

  function openEditForm(project: Project) {
    setForm({
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      clientId: project.clientId,
      estimatedRevenue: String(project.estimatedRevenue),
    })
    setFormError('')
    setEditor({ mode: 'edit', project })
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !editor) return

    setSaving(true)
    setFormError('')
    const isEditing = editor.mode === 'edit'
    const input = {
      ...form,
      name: form.name.trim(),
      estimatedRevenue: Number(form.estimatedRevenue),
      description: form.description.trim() || (isEditing ? null : undefined),
    }

    try {
      const project = isEditing
        ? await updateProject(editor.project.id, input)
        : await createProject(input)
      if (!isEditing) setPage(1)
      setProjects((current) =>
        isEditing
          ? current.map((item) => (item.id === project.id ? project : item))
          : current,
      )
      setRefreshKey((current) => current + 1)
      setEditor(null)
      setPageError('')
    } catch (error) {
      const message = getErrorMessage(error)
      setFormError(message)
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('access_token')
        setAuthNotice('Your session expired. Sign in again to continue.')
        setProjects([])
        setClients([])
        setToken(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject(project: Project) {
    if (!token || !window.confirm(`Delete "${project.name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(project.id)
    setPageError('')
    try {
      await removeProject(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setPageError(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('access_token')
        setAuthNotice('Your session expired. Sign in again to continue.')
        setProjects([])
        setClients([])
        setToken(null)
      }
    } finally {
      setDeletingId('')
    }
  }

  if (!token) {
    return (
      <section aria-labelledby="projects-title" className="projects-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">PROJECT MANAGEMENT</div>
            <h1 id="projects-title">Projects</h1>
            <p>Sign in to manage your projects.</p>
          </div>
        </div>
        <div className="projects-auth-card">
          <div className="projects-auth-mark" aria-hidden="true">P</div>
          <h2>Inicio de sesión</h2>
          <p>Accede con la cuenta que te proporcionó un administrador.</p>
          {authNotice && <div className="projects-notice" role="status">{authNotice}</div>}
          {authError && <div className="projects-error" role="alert">{authError}</div>}
          <form className="projects-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setAuthEmail(event.target.value)}
                required
                type="email"
                value={authEmail}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                minLength={8}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
                type="password"
                value={authPassword}
              />
            </label>
            <button className="project-primary-button projects-auth-submit" disabled={authPending} type="submit">
              {authPending ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>
          <p className="projects-auth-help">Solicita acceso al administrador de tu espacio de trabajo.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="projects-title" className="projects-page">
      <div className="page-heading projects-heading">
        <div>
          <div className="eyebrow">PROJECT MANAGEMENT</div>
          <h1 id="projects-title">Projects</h1>
          <p>Manage project details, clients, and progress.</p>
        </div>
        <button className="project-primary-button" onClick={openCreateForm} type="button">
          <span aria-hidden="true">+</span> New project
        </button>
      </div>

      {pageError && (
        <div className="projects-error projects-page-error" role="alert">
          {pageError}
        </div>
      )}

      <div className="projects-toolbar">
        <label className="projects-search">
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
            <circle cx="8.8" cy="8.8" r="5.8" />
            <path d="m13.2 13.2 4 4" />
          </svg>
          <input
            aria-label="Search projects"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search projects or clients…"
            value={query}
          />
        </label>
        {clientFilterId && (
          <>
            <span className="projects-result-count">
              Cliente: {clients.find((client) => client.id === clientFilterId)?.name ?? 'seleccionado'}
            </span>
            <button className="project-text-button" onClick={() => {
              setClientFilterId('')
              setPage(1)
            }} type="button">
              Mostrar todos los proyectos
            </button>
          </>
        )}
        <span className="projects-result-count">
          {total} {total === 1 ? 'project' : 'projects'}
        </span>
        <button className="project-text-button" onClick={signOut} type="button">
          Sign out
        </button>
      </div>

      {loading ? (
        <div className="projects-state" role="status">Loading projects…</div>
      ) : total === 0 ? (
        <div className="projects-state projects-empty-state">
          <span className="projects-empty-icon" aria-hidden="true">↗</span>
          <h2>{clientFilterId ? 'Este cliente aún no tiene proyectos' : query ? 'No projects match your search' : 'No projects yet'}</h2>
          <p>{clientFilterId ? 'Puedes crear un proyecto para este cliente.' : query ? `No projects match “${query}”.` : 'Create a project to start organizing work by client.'}</p>
          {clientFilterId && (
            <button
              className="project-primary-button"
              onClick={() => {
                setForm({ ...initialProjectInput, clientId: clientFilterId })
                setEditor({ mode: 'create' })
              }}
              type="button"
            >
              Crear proyecto
            </button>
          )}
          {!clientFilterId && !query && (
            <button className="project-primary-button" onClick={openCreateForm} type="button">
              <span aria-hidden="true">+</span> Create project
            </button>
          )}
        </div>
      ) : (
        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Client</th>
                <th scope="col">Status</th>
                <th scope="col">Estimated sale</th>
                <th scope="col">Updated</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className="project-name">{project.name}</div>
                    <div className="project-description">{project.description || 'No description'}</div>
                  </td>
                  <td>
                    <div className="project-client">{project.client.name}</div>
                    {project.client.companyName && (
                      <div className="project-description">{project.client.companyName}</div>
                    )}
                  </td>
                  <td>
                    <span className={`project-status project-status-${project.status.toLowerCase().replace('_', '-')}`}>
                      <span aria-hidden="true" />
                      {statusLabels[project.status]}
                    </span>
                  </td>
                  <td className="project-date">{formatCurrency(project.estimatedRevenue)}</td>
                  <td className="project-date">{formatDate(project.updatedAt)}</td>
                  <td>
                    <div className="project-row-actions">
                      <button
                        aria-label={`Edit ${project.name}`}
                        className="project-icon-button"
                        onClick={() => openEditForm(project)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`View details for ${project.name}`}
                        className="project-icon-button"
                        onClick={() => setDetailsProject(project)}
                        type="button"
                      >
                        Detalle
                      </button>
                      <button
                        aria-label={`Delete ${project.name}`}
                        className="project-icon-button project-delete-button"
                        disabled={deletingId === project.id}
                        onClick={() => void deleteProject(project)}
                        type="button"
                      >
                        {deletingId === project.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && (
        <PaginationControls
          page={page}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {editor && (
        <div
          className="project-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setEditor(null)
          }}
        >
          <section aria-labelledby="project-editor-title" aria-modal="true" className="project-modal" role="dialog">
            <div className="project-modal-header">
              <div>
                <div className="eyebrow">{editor.mode === 'create' ? 'NEW ENTRY' : 'PROJECT DETAILS'}</div>
                <h2 id="project-editor-title">{editor.mode === 'create' ? 'Create project' : 'Edit project'}</h2>
              </div>
              <button
                aria-label="Close dialog"
                className="project-modal-close"
                disabled={saving}
                onClick={() => setEditor(null)}
                type="button"
              >
                ×
              </button>
            </div>
            {formError && <div className="projects-error" role="alert">{formError}</div>}
            <form className="projects-form project-editor-form" onSubmit={(event) => void handleProjectSubmit(event)}>
              <label>
                Project name
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Website redesign"
                  required
                  value={form.name}
                />
              </label>
              <label>
                Client *
                <select
                  onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                  required
                  value={form.clientId}
                >
                  {clients.length === 0 && <option value="">Create a client first</option>}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}{client.companyName ? ` · ${client.companyName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="project-inline-action"
                onClick={openClientForm}
                type="button"
              >
                + Add a new client
              </button>
              <label>
                Status
                <select
                  onChange={(event) => {
                    const status = projectStatuses.find((value) => value === event.target.value)
                    if (status) setForm({ ...form, status })
                  }}
                  value={form.status}
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </label>
              <label>
                Estimated sale
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setForm({ ...form, estimatedRevenue: event.target.value })}
                  required
                  step="0.01"
                  type="number"
                  value={form.estimatedRevenue}
                />
              </label>
              <label>
                Description <span className="optional-label">Optional</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Add a few details about this project…"
                  rows={4}
                  value={form.description}
                />
              </label>
              <div className="project-modal-actions">
                <button
                  className="project-secondary-button"
                  disabled={saving}
                  onClick={() => setEditor(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="project-primary-button"
                  disabled={saving || !form.clientId}
                  type="submit"
                >
                  {saving ? 'Saving…' : editor.mode === 'create' ? 'Create project' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {detailsProject && (
        <div
          className="project-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsProject(null)
          }}
        >
          <section aria-labelledby="project-details-title" aria-modal="true" className="project-modal" role="dialog">
            <div className="project-modal-header">
              <div>
                <div className="eyebrow">DETALLE DEL PROYECTO</div>
                <h2 id="project-details-title">{detailsProject.name}</h2>
              </div>
              <button
                aria-label="Cerrar detalle"
                className="project-modal-close"
                onClick={() => setDetailsProject(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <dl className="project-details-list">
              <div><dt>Cliente</dt><dd>{detailsProject.client.name}{detailsProject.client.companyName ? ` · ${detailsProject.client.companyName}` : ''}</dd></div>
              <div><dt>Estado</dt><dd>{statusLabels[detailsProject.status]}</dd></div>
              <div><dt>Venta estimada</dt><dd>{formatCurrency(detailsProject.estimatedRevenue)}</dd></div>
              <div><dt>Descripción</dt><dd>{detailsProject.description || 'Sin descripción'}</dd></div>
              <div><dt>Última actualización</dt><dd>{formatDate(detailsProject.updatedAt)}</dd></div>
            </dl>
            <div className="project-modal-actions">
              <button className="project-secondary-button" onClick={() => setDetailsProject(null)} type="button">Cerrar</button>
              <button
                className="project-primary-button"
                onClick={() => {
                  openEditForm(detailsProject)
                  setDetailsProject(null)
                }}
                type="button"
              >
                Editar proyecto
              </button>
              {sessionStorage.getItem('user_role') === 'ADMIN' && (
                <button
                  className="project-primary-button"
                  onClick={() => navigateToProductionOrder(detailsProject.id)}
                  type="button"
                >
                  Crear orden de producción
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {clientEditorOpen && (
        <div
          className="project-modal-backdrop project-client-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingClient) {
              setClientEditorOpen(false)
            }
          }}
        >
          <section
            aria-labelledby="client-editor-title"
            aria-modal="true"
            className="project-modal"
            role="dialog"
          >
            <div className="project-modal-header">
              <div>
                <div className="eyebrow">CLIENT DETAILS</div>
                <h2 id="client-editor-title">Add a client</h2>
              </div>
              <button
                aria-label="Close dialog"
                className="project-modal-close"
                disabled={savingClient}
                onClick={() => setClientEditorOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="client-modal-description">
              The client will be saved and selected for your project.
            </p>
            {clientFormError && <div className="projects-error" role="alert">{clientFormError}</div>}
            <form
              className="projects-form project-editor-form"
              onSubmit={(event) => void handleClientSubmit(event)}
            >
              <label>
                Client name
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) =>
                    setClientForm({ ...clientForm, name: event.target.value })
                  }
                  placeholder="e.g. Acme Studio"
                  required
                  value={clientForm.name}
                />
              </label>
              <label>
                Company <span className="optional-label">Optional</span>
                <input
                  onChange={(event) =>
                    setClientForm({ ...clientForm, companyName: event.target.value })
                  }
                  placeholder="Company name"
                  value={clientForm.companyName}
                />
              </label>
              <label>
                Email <span className="optional-label">Optional</span>
                <input
                  onChange={(event) =>
                    setClientForm({ ...clientForm, email: event.target.value })
                  }
                  placeholder="contact@example.com"
                  type="email"
                  value={clientForm.email}
                />
              </label>
              <label>
                Phone <span className="optional-label">Optional</span>
                <input
                  onChange={(event) =>
                    setClientForm({ ...clientForm, phone: event.target.value })
                  }
                  placeholder="+1 555 0100"
                  value={clientForm.phone}
                />
              </label>
              <label>
                Notes <span className="optional-label">Optional</span>
                <textarea
                  onChange={(event) =>
                    setClientForm({ ...clientForm, notes: event.target.value })
                  }
                  placeholder="Additional client details…"
                  rows={3}
                  value={clientForm.notes}
                />
              </label>
              <div className="project-modal-actions">
                <button
                  className="project-secondary-button"
                  disabled={savingClient}
                  onClick={() => setClientEditorOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="project-primary-button" disabled={savingClient} type="submit">
                  {savingClient ? 'Saving…' : 'Save client'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
