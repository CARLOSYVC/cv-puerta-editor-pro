import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../services/api'
import { MaterialCostWorkflow } from '../material-consumption/MaterialCostWorkflow'
import {
  canAccessMaterialConsumption,
  navigateToMaterialConsumption,
} from '../material-consumption/material-cost-navigation'
import {
  createMaterial,
  deleteMaterial,
  getPaginatedMaterials,
  updateMaterial,
  type Material,
  type MaterialInput,
  type MaterialUpdateInput,
} from '../services/materials'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

interface AuthResponse {
  access_token: string
}

type MaterialEditor = { mode: 'create' } | { mode: 'edit'; material: Material }

const initialForm: MaterialInput = {
  name: '',
  description: '',
  unit: '',
  unitCost: 0,
  minimumStock: 0,
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatCost(value: number | string): string {
  const cost = Number(value)
  return Number.isFinite(cost) ? cost.toFixed(2) : String(value)
}

export function MaterialsPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('access_token'))
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [materials, setMaterials] = useState<Material[]>([])
  const [pageError, setPageError] = useState('')
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editor, setEditor] = useState<MaterialEditor | null>(null)
  const [form, setForm] = useState<MaterialInput>(initialForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      getPaginatedMaterials({ query, page, pageSize: 25 })
        .then((result) => {
          if (cancelled) return
          setMaterials(result.items)
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
            setMaterials([])
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
  }, [token, query, page, refreshKey])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthPending(true)
    setAuthError('')

    try {
      const response = await apiRequest<AuthResponse>(
        authMode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body:
            authMode === 'login'
              ? { email: authEmail, password: authPassword }
              : { name: authName, email: authEmail, password: authPassword },
        },
      )
      sessionStorage.setItem('access_token', response.access_token)
      window.dispatchEvent(new Event('auth-changed'))
      setToken(response.access_token)
      setAuthPassword('')
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
    setMaterials([])
    setEditor(null)
  }

  function openCreateForm() {
    setForm(initialForm)
    setFormError('')
    setEditor({ mode: 'create' })
  }

  function openEditForm(material: Material) {
    setForm({
      name: material.name,
      description: material.description ?? '',
      unit: material.unit,
      unitCost: Number(material.unitCost),
      minimumStock: Number(material.minimumStock),
    })
    setFormError('')
    setEditor({ mode: 'edit', material })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return

    setSaving(true)
    setFormError('')
    const isEditing = editor.mode === 'edit'
    const input = {
      ...form,
      name: form.name.trim(),
      unit: form.unit.trim(),
      description: form.description?.trim() || (isEditing ? null : undefined),
    }

    try {
      await (isEditing
        ? await updateMaterial(editor.material.id, {
            name: input.name,
            description: input.description,
            unit: input.unit,
            minimumStock: input.minimumStock,
          } satisfies MaterialUpdateInput)
        : await createMaterial(input))
      if (!isEditing) setPage(1)
      setRefreshKey((current) => current + 1)
      setEditor(null)
      setPageError('')
    } catch (error) {
      setFormError(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('access_token')
        setMaterials([])
        setToken(null)
        setEditor(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(material: Material) {
    if (!window.confirm(`Delete "${material.name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(material.id)
    setPageError('')
    try {
      await deleteMaterial(material.id)
      setMaterials((current) => current.filter((item) => item.id !== material.id))
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setPageError(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('access_token')
        setMaterials([])
        setToken(null)
      }
    } finally {
      setDeletingId('')
    }
  }

  if (!token) {
    return (
      <section aria-labelledby="materials-title" className="projects-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">MATERIAL CATALOG</div>
            <h1 id="materials-title">Materials</h1>
            <p>Sign in to manage materials and unit costs.</p>
          </div>
        </div>
        <div className="projects-auth-card">
          <div aria-hidden="true" className="projects-auth-mark">P</div>
          <h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>
            {authMode === 'login'
              ? 'Sign in to access your materials catalog.'
              : 'Register to get started with your workspace.'}
          </p>
          {authError && <div className="projects-error" role="alert">{authError}</div>}
          <form className="projects-form" onSubmit={(event) => void handleAuthSubmit(event)}>
            {authMode === 'register' && (
              <label>
                Name
                <input
                  autoComplete="name"
                  onChange={(event) => setAuthName(event.target.value)}
                  required
                  value={authName}
                />
              </label>
            )}
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
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
                type="password"
                value={authPassword}
              />
            </label>
            <button className="project-primary-button projects-auth-submit" disabled={authPending} type="submit">
              {authPending ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button
            className="projects-auth-switch"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login')
              setAuthError('')
            }}
            type="button"
          >
            {authMode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="materials-title" className="projects-page">
      <div className="page-heading projects-heading">
        <div>
          <div className="eyebrow">MATERIAL CATALOG</div>
          <h1 id="materials-title">Materials</h1>
          <p>El costo promedio se calcula con recepciones y ajustes de inventario; al crear un material defines su costo inicial.</p>
        </div>
        <button className="project-primary-button" onClick={openCreateForm} type="button">
          <span aria-hidden="true">+</span> New material
        </button>
      </div>

      {pageError && <div className="projects-error projects-page-error" role="alert">{pageError}</div>}
      <MaterialCostWorkflow current="materials" />

      <div className="projects-toolbar">
        <label className="projects-search">
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
            <circle cx="8.8" cy="8.8" r="5.8" />
            <path d="m13.2 13.2 4 4" />
          </svg>
          <input
            aria-label="Search materials"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search materials…"
            value={query}
          />
        </label>
        <span className="projects-result-count">
          {total} {total === 1 ? 'material' : 'materials'}
        </span>
        <button className="project-text-button" onClick={signOut} type="button">
          Sign out
        </button>
      </div>

      {loading ? (
        <div className="projects-state" role="status">Loading materials…</div>
      ) : materials.length === 0 ? (
        <div className="projects-state projects-empty-state">
          <span aria-hidden="true" className="projects-empty-icon">◇</span>
          <h2>{query ? 'Sin resultados' : 'No materials yet'}</h2>
          <p>{query ? 'Prueba con otro término de búsqueda.' : 'Add materials to keep descriptions, units, and costs in one place.'}</p>
          <button className="project-primary-button" onClick={openCreateForm} type="button">
            <span aria-hidden="true">+</span> Create material
          </button>
        </div>
      ) : (
        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Unit</th>
                <th scope="col">Costo promedio</th>
                <th scope="col">Minimum stock</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id}>
                  <td>
                    <div className="project-name">{material.name}</div>
                    <div className="project-description">{material.description || 'No description'}</div>
                  </td>
                  <td>{material.unit}</td>
                  <td className="material-cost">{formatCost(material.unitCost)} <span>/ {material.unit}</span></td>
                  <td>{formatCost(material.minimumStock)} {material.unit}</td>
                  <td>
                    <div className="project-row-actions">
                      {canAccessMaterialConsumption(sessionStorage.getItem('user_role')) && (
                        <button
                          className="project-text-button"
                          onClick={() => navigateToMaterialConsumption(material.id)}
                          type="button"
                        >
                          Registrar consumo
                        </button>
                      )}
                      <button
                        aria-label={`Edit ${material.name}`}
                        className="project-icon-button"
                        onClick={() => openEditForm(material)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`Delete ${material.name}`}
                        className="project-icon-button project-delete-button"
                        disabled={deletingId === material.id}
                        onClick={() => void handleDelete(material)}
                        type="button"
                      >
                        {deletingId === material.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && materials.length > 0 && (
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
          <section aria-labelledby="material-editor-title" aria-modal="true" className="project-modal" role="dialog">
            <div className="project-modal-header">
              <div>
                <div className="eyebrow">{editor.mode === 'create' ? 'NEW ENTRY' : 'MATERIAL DETAILS'}</div>
                <h2 id="material-editor-title">
                  {editor.mode === 'create' ? 'Create material' : 'Edit material'}
                </h2>
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
            <form className="projects-form project-editor-form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Material name
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Cotton canvas"
                  required
                  value={form.name}
                />
              </label>
              <label>
                Unit
                <input
                  maxLength={32}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                  placeholder="e.g. meter, kg, piece"
                  required
                  value={form.unit}
                />
              </label>
              {editor.mode === 'create' && (
                <label>
                  Costo unitario inicial
                  <input
                    min="0"
                    onChange={(event) =>
                      setForm({ ...form, unitCost: event.target.value === '' ? 0 : Number(event.target.value) })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={form.unitCost}
                  />
                </label>
              )}
              <label>
                Stock minimum
                <input
                  min="0"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      minimumStock: event.target.value === '' ? 0 : Number(event.target.value),
                    })
                  }
                  required
                  step="0.01"
                  type="number"
                  value={form.minimumStock}
                />
              </label>
              <label>
                Description <span className="optional-label">Optional</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Add details about this material…"
                  rows={4}
                  value={form.description ?? ''}
                />
              </label>
              <div className="project-modal-actions">
                <button className="project-secondary-button" disabled={saving} onClick={() => setEditor(null)} type="button">
                  Cancel
                </button>
                <button className="project-primary-button" disabled={saving} type="submit">
                  {saving ? 'Saving…' : editor.mode === 'create' ? 'Create material' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
