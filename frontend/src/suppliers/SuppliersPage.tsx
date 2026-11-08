import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { navigateToPurchaseOrderForSupplier } from '../purchase-orders/purchasing-navigation'
import { PurchasingWorkflow } from '../purchase-orders/PurchasingWorkflow'
import {
  createSupplier,
  getPaginatedSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierInput,
} from '../services/purchasing'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

const emptySupplier: SupplierInput = { name: '', email: '', phone: '', companyName: '', notes: '' }

export function SuppliersPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [form, setForm] = useState<SupplierInput>(emptySupplier)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      getPaginatedSuppliers({ query, page, pageSize: 25 })
        .then((result) => {
          if (cancelled) return
          setSuppliers(result.items)
          setTotal(result.total)
          setTotalPages(result.totalPages)
          setPage(result.page)
          setError('')
        })
        .catch((cause: unknown) => {
          if (cancelled) return
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los proveedores.')
          if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token, query, page, refreshKey])

  function startEdit(supplier: Supplier) {
    setEditing(supplier)
    setForm({
      name: supplier.name,
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      companyName: supplier.companyName ?? '',
      notes: supplier.notes ?? '',
    })
    setFormError('')
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptySupplier)
    setFormError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const input: SupplierInput = {
        name: form.name.trim(),
        ...(form.email?.trim() && { email: form.email.trim() }),
        ...(form.phone?.trim() && { phone: form.phone.trim() }),
        ...(form.companyName?.trim() && { companyName: form.companyName.trim() }),
        ...(form.notes?.trim() && { notes: form.notes.trim() }),
      }
      const saved = editing
        ? await updateSupplier(editing.id, input)
        : await createSupplier(input)
      if (!editing) setPage(1)
      setSuppliers((current) => current.map((supplier) => supplier.id === saved.id ? saved : supplier))
      setRefreshKey((current) => current + 1)
      cancelEdit()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar el proveedor.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(supplier: Supplier) {
    try {
      const updated = await updateSupplier(supplier.id, { isActive: !supplier.isActive })
      setSuppliers((current) => current.map((item) => item.id === updated.id ? updated : item))
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el proveedor.')
    }
  }

  if (!token) {
    return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">COMPRAS</div><h1>Suppliers</h1><p>Inicia sesión para administrar proveedores.</p></div></div><div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>
  }

  return (
    <section aria-labelledby="suppliers-title" className="projects-page">
      <div className="page-heading">
        <div><div className="eyebrow">COMPRAS</div><h1 id="suppliers-title">Suppliers</h1><p>Administra proveedores y sus datos de contacto.</p></div>
      </div>
      <PurchasingWorkflow current="suppliers" />
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      <form className="supplier-form" onSubmit={submit}>
        <div className="supplier-form-heading"><h2>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h2></div>
        <div className="supplier-fields">
          <label>Nombre<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Empresa<input maxLength={120} value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label>
          <label>Correo<input type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Teléfono<input maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="supplier-notes-field">Notas<input maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        {formError && <div className="projects-error" role="alert">{formError}</div>}
        <div className="supplier-form-actions">
          {editing && <button className="project-secondary-button" type="button" onClick={cancelEdit}>Cancelar</button>}
          <button className="project-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar proveedor'}</button>
        </div>
      </form>
      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar proveedores"
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre, empresa, correo o teléfono…"
            value={query}
          />
        </label>
        <span className="projects-result-count">{total} proveedores</span>
      </div>
      {loading ? <div className="projects-state" role="status">Cargando proveedores…</div> : suppliers.length === 0 ? <div className="projects-state projects-empty-state"><h2>{query ? 'Sin resultados' : 'Sin proveedores'}</h2><p>{query ? 'Prueba con otro término de búsqueda.' : 'Agrega un proveedor para comenzar a crear órdenes de compra.'}</p></div> : (
        <div className="projects-table-wrap">
          <table className="projects-table operations-table">
            <thead><tr><th>Proveedor</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{suppliers.map((supplier) => <tr key={supplier.id}>
              <td><div className="project-name">{supplier.name}</div>{supplier.companyName && <span className="supplier-company">{supplier.companyName}</span>}</td>
              <td>{supplier.email ?? '—'}{supplier.phone && <span className="supplier-company">{supplier.phone}</span>}</td>
              <td><span className={`supplier-status${supplier.isActive ? ' supplier-status-active' : ''}`}>{supplier.isActive ? 'Activo' : 'Inactivo'}</span></td>
              <td><div className="supplier-actions">
                {supplier.isActive && <button className="project-primary-button" type="button" onClick={() => navigateToPurchaseOrderForSupplier(supplier.id)}>Crear orden</button>}
                <button className="project-secondary-button" type="button" onClick={() => startEdit(supplier)}>Editar</button>
                <button className="project-secondary-button" type="button" onClick={() => void toggleActive(supplier)}>{supplier.isActive ? 'Desactivar' : 'Activar'}</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && (
        <PaginationControls page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
      )}
    </section>
  )
}
