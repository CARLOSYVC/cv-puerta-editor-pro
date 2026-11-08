import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { consumeProductionOrderProjectIntent } from './production-order-navigation'
import {
  createProductionOrder,
  deleteProductionOrder,
  getOperationProjects,
  getPaginatedProductionOrders,
  getProductionOrders,
  updateProductionOrder,
  type ProductionOrder,
  type ProductionOrderInput,
  type ProductionOrderStatus,
  type ProjectOption,
} from '../services/operations'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

const statusLabels: Record<ProductionOrderStatus, string> = {
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

type Editor = { mode: 'create' } | { mode: 'edit'; order: ProductionOrder }
const initialForm: ProductionOrderInput = {
  name: '',
  description: '',
  projectId: '',
  status: 'PLANNED',
}

function exportProductionOrders(orders: ProductionOrder[]) {
  return [{
    name: 'Órdenes de producción',
    columns: ['Orden', 'Descripción', 'Proyecto', 'Estado', 'Fecha de creación'],
    rows: orders.map((order) => [
      order.name,
      order.description ?? '',
      order.project.name,
      statusLabels[order.status],
      new Intl.DateTimeFormat('es').format(new Date(order.createdAt)),
    ]),
  }]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

export function ProductionOrdersPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [form, setForm] = useState<ProductionOrderInput>(initialForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([
        getPaginatedProductionOrders({ query, page, pageSize: 25 }),
        getOperationProjects(),
      ])
      .then(([orderResult, nextProjects]) => {
        if (cancelled) return
        setOrders(orderResult.items)
        setTotal(orderResult.total)
        setTotalPages(orderResult.totalPages)
        setPage(orderResult.page)
        setProjects(nextProjects)
        const projectId = consumeProductionOrderProjectIntent()
        if (projectId) {
          if (nextProjects.some((project) => project.id === projectId)) {
            setForm({ ...initialForm, projectId })
            setEditor({ mode: 'create' })
            setError('')
          } else {
            setError('No se encontró el proyecto seleccionado para la orden.')
          }
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(message(cause))
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

  function openEditor(nextEditor: Editor) {
    setForm(nextEditor.mode === 'edit'
      ? {
          name: nextEditor.order.name,
          description: nextEditor.order.description ?? '',
          projectId: nextEditor.order.projectId,
          status: nextEditor.order.status,
        }
      : { ...initialForm, projectId: projects[0]?.id ?? '' })
    setFormError('')
    setEditor(nextEditor)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    setSaving(true)
    setFormError('')
    const input = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || null,
    }
    try {
      const saved = editor.mode === 'edit'
        ? await updateProductionOrder(editor.order.id, input)
        : await createProductionOrder(input)
      setOrders((current) => editor.mode === 'edit'
        ? current.map((item) => item.id === saved.id ? saved : item)
        : current)
      if (editor.mode === 'create') setPage(1)
      setRefreshKey((current) => current + 1)
      setEditor(null)
    } catch (cause) {
      setFormError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  async function remove(order: ProductionOrder) {
    if (!window.confirm(`¿Eliminar la orden "${order.name}"?`)) return
    try {
      await deleteProductionOrder(order.id)
      setOrders((current) => current.filter((item) => item.id !== order.id))
      setRefreshKey((current) => current + 1)
      setError('')
    } catch (cause) {
      setError(message(cause))
    }
  }

  if (!token) return <OperationsSignIn module="Production Orders" />

  return (
    <section aria-labelledby="production-orders-title" className="projects-page">
      <div className="page-heading projects-heading">
        <div>
          <div className="eyebrow">PRODUCCIÓN</div>
          <h1 id="production-orders-title">Production Orders</h1>
          <p>Organiza órdenes de producción vinculadas a tus Projects.</p>
        </div>
        <button className="project-primary-button" disabled={!projects.length} onClick={() => openEditor({ mode: 'create' })} type="button">
          + Nueva orden
        </button>
      </div>
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      {!projects.length && !loading && <div className="projects-notice" role="status">Crea un Project antes de registrar órdenes.</div>}
      {!loading && orders.length > 0 && (
        <div className="module-export-row">
          <DataExportActions
            fileName="ordenes-produccion"
            sheets={exportProductionOrders(orders)}
            loadSheets={async () => exportProductionOrders(await getProductionOrders())}
          />
        </div>
      )}
      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar órdenes de producción"
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por orden, descripción o proyecto…"
            value={query}
          />
        </label>
        <span className="projects-result-count">{total} órdenes</span>
      </div>
      {loading ? <div className="projects-state" role="status">Cargando órdenes…</div> : orders.length === 0 ? (
        <div className="projects-state projects-empty-state"><h2>{query ? 'Sin resultados' : 'No hay órdenes de producción'}</h2><p>{query ? 'Prueba con otro término de búsqueda.' : 'Crea una orden y asígnala a un Project.'}</p></div>
      ) : (
        <div className="projects-table-wrap">
          <table className="projects-table operations-table">
            <thead><tr><th>Orden</th><th>Project</th><th>Estado</th><th>Creada</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id}>
                <td><div className="project-name">{order.name}</div>{order.description && <div className="project-description">{order.description}</div>}</td>
                <td>{order.project.name}</td>
                <td><span className={`operation-status operation-status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span></td>
                <td>{new Intl.DateTimeFormat('es').format(new Date(order.createdAt))}</td>
                <td><div className="project-row-actions">
                  <button className="project-icon-button" onClick={() => openEditor({ mode: 'edit', order })} type="button">Editar</button>
                  <button className="project-icon-button project-delete-button" onClick={() => void remove(order)} type="button">Eliminar</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && (
        <PaginationControls page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
      )}
      {editor && (
        <div className="project-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null) }}>
          <section aria-modal="true" aria-labelledby="order-editor-title" className="project-modal" role="dialog">
            <div className="project-modal-header"><h2 id="order-editor-title">{editor.mode === 'create' ? 'Nueva orden' : 'Editar orden'}</h2><button aria-label="Cerrar" className="project-modal-close" onClick={() => setEditor(null)} type="button">×</button></div>
            {formError && <div className="projects-error" role="alert">{formError}</div>}
            <form className="projects-form project-editor-form" onSubmit={(event) => void submit(event)}>
              <label>Nombre<input autoFocus maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
              <label>Project<select onChange={(event) => setForm({ ...form, projectId: event.target.value })} required value={form.projectId}><option value="">Seleccionar Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label>Estado<select onChange={(event) => setForm({ ...form, status: event.target.value as ProductionOrderStatus })} value={form.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Descripción<textarea maxLength={1000} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} value={form.description ?? ''} /></label>
              <div className="project-modal-actions"><button className="project-secondary-button" disabled={saving} onClick={() => setEditor(null)} type="button">Cancelar</button><button className="project-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar'}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

function OperationsSignIn({ module }: { module: string }) {
  return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">OPERACIONES</div><h1>{module}</h1><p>Inicia sesión para continuar.</p></div></div><div className="projects-state projects-empty-state"><h2>Se requiere iniciar sesión</h2><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>
}
