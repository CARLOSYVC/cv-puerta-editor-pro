import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { getMaterials, type Material } from '../services/materials'
import {
  consumePurchaseOrderSupplierIntent,
  navigateToReceivingOrder,
} from './purchasing-navigation'
import { PurchasingWorkflow } from './PurchasingWorkflow'
import {
  createPurchaseOrder,
  getPaginatedPurchaseOrders,
  getPurchaseOrders,
  getSuppliers,
  updatePurchaseOrderStatus,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type Supplier,
} from '../services/purchasing'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

interface OrderLineForm {
  materialId: string
  quantity: string
  unitCost: string
}

const statusLabels: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Borrador',
  ORDERED: 'Ordenada',
  PARTIALLY_RECEIVED: 'Recibida parcialmente',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
}

function amount(value: number | string): string {
  return Number(value).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Ocurrió un error. Intenta de nuevo.'
}

export function PurchaseOrdersPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [supplierId, setSupplierId] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<OrderLineForm[]>([{ materialId: '', quantity: '1', unitCost: '' }])
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([
        getSuppliers(),
        getMaterials(),
        getPaginatedPurchaseOrders({ query, page, pageSize: 25 }),
      ])
      .then(([nextSuppliers, nextMaterials, orderResult]) => {
        if (cancelled) return
        setSuppliers(nextSuppliers)
        setMaterials(nextMaterials)
        setOrders(orderResult.items)
        setTotal(orderResult.total)
        setTotalPages(orderResult.totalPages)
        setPage(orderResult.page)
        const supplierIntent = consumePurchaseOrderSupplierIntent()
        const selectedSupplier = nextSuppliers.find(
          (supplier) => supplier.isActive && supplier.id === supplierIntent,
        )
        setSupplierId(selectedSupplier?.id ?? nextSuppliers.find((supplier) => supplier.isActive)?.id ?? '')
        if (supplierIntent && !selectedSupplier) {
          setFormError('El proveedor seleccionado ya no está activo o no está disponible.')
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(getError(cause))
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token, query, page, refreshKey])

  function updateLine(index: number, patch: Partial<OrderLineForm>) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line
      const next = { ...line, ...patch }
      if (patch.materialId) {
        const material = materials.find((item) => item.id === patch.materialId)
        if (material) next.unitCost = String(material.unitCost)
      }
      return next
    }))
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await createPurchaseOrder({
        supplierId,
        ...(expectedAt && { expectedAt: new Date(expectedAt).toISOString() }),
        ...(notes && { notes }),
        items: lines.map((line) => ({
          materialId: line.materialId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      })
      setPage(1)
      setRefreshKey((current) => current + 1)
      setExpectedAt('')
      setNotes('')
      setLines([{ materialId: '', quantity: '1', unitCost: '' }])
    } catch (cause) {
      setFormError(getError(cause))
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(order: PurchaseOrder, status: PurchaseOrderStatus) {
    setError('')
    try {
      const updated = await updatePurchaseOrderStatus(order.id, status)
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item))
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(getError(cause))
    }
  }

  if (!token) {
    return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">COMPRAS</div><h1>Purchase Orders</h1><p>Inicia sesión para administrar compras.</p></div></div><div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>
  }

  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive)
  const exportSheets = purchaseOrderExportSheets(orders)

  return (
    <section aria-labelledby="purchase-orders-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">COMPRAS</div><h1 id="purchase-orders-title">Purchase Orders</h1><p>Los precios de la orden son cotizados; Recepciones registra cantidades y costos reales entregados.</p></div></div>
      <PurchasingWorkflow current="purchase-orders" />
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      <form className="supplier-form" onSubmit={(event) => void submitOrder(event)}>
        <div className="supplier-form-heading"><h2>Nueva orden de compra</h2></div>
        {activeSuppliers.length === 0 ? <p className="purchase-hint">Agrega y activa un proveedor antes de crear órdenes. <a href="#suppliers">Ir a Suppliers</a></p> : (
          <>
            <div className="supplier-fields">
              <label>Proveedor<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecciona proveedor</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label>Entrega esperada<input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></label>
              <label className="supplier-notes-field">Notas<input maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            </div>
            <div className="purchase-lines-heading"><h3>Materiales</h3><button className="project-secondary-button" type="button" onClick={() => setLines((current) => [...current, { materialId: '', quantity: '1', unitCost: '' }])}>Agregar material</button></div>
            <div className="purchase-lines">
              {lines.map((line, index) => <div className="purchase-line" key={index}>
                <label>Material<select required value={line.materialId} onChange={(event) => updateLine(index, { materialId: event.target.value })}><option value="">Selecciona material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}</select></label>
                <label>Cantidad<input required min="0.01" step="0.01" type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
                <label>Costo cotizado unitario<input required min="0" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} /></label>
                {lines.length > 1 && <button aria-label="Quitar material" className="purchase-remove-line" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>×</button>}
              </div>)}
            </div>
            {formError && <div className="projects-error" role="alert">{formError}</div>}
            <div className="supplier-form-actions"><button className="project-primary-button" disabled={saving || !materials.length} type="submit">{saving ? 'Guardando…' : 'Crear borrador'}</button></div>
          </>
        )}
      </form>

      <div className="inventory-section-heading inventory-movements-heading"><h2>Órdenes</h2><span>{total} órdenes</span></div>
      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar órdenes de compra"
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por proveedor o identificador…"
            value={query}
          />
        </label>
      </div>
      {!loading && orders.length > 0 && (
        <div className="module-export-row">
          <DataExportActions
            fileName="compras"
            sheets={exportSheets}
            loadSheets={async () => purchaseOrderExportSheets(await getPurchaseOrders())}
          />
        </div>
      )}
      {loading ? <div className="projects-state" role="status">Cargando órdenes…</div> : orders.length === 0 ? <div className="projects-state projects-empty-state"><h2>{query ? 'Sin resultados' : 'Sin órdenes de compra'}</h2><p>{query ? 'Prueba con otro término de búsqueda.' : 'Las órdenes creadas aparecerán aquí.'}</p></div> : (
        <div className="purchase-order-list">
          {orders.map((order) => <article className="purchase-order-card" key={order.id}>
            <div className="purchase-order-header">
              <div><h3>{order.supplier.name}</h3><span>{new Intl.DateTimeFormat('es').format(new Date(order.createdAt))}{order.expectedAt ? ` · Entrega esperada ${new Intl.DateTimeFormat('es').format(new Date(order.expectedAt))}` : ''}</span></div>
              <span className={`supplier-status purchase-status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span>
            </div>
            <div className="projects-table-wrap purchase-items-table"><table className="projects-table operations-table"><thead><tr><th>Material</th><th>Solicitado</th><th>Recibido</th><th>Costo cotizado unitario</th><th>Total cotizado</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.material.name}</td><td>{amount(item.quantity)} {item.material.unit}</td><td>{amount(item.receivedQuantity)} {item.material.unit}</td><td>{amount(item.unitCost)}</td><td>{amount(Number(item.quantity) * Number(item.unitCost))}</td></tr>)}</tbody></table></div>
            {order.notes && <p className="purchase-order-notes">{order.notes}</p>}
            <div className="purchase-order-actions">
              {order.status === 'DRAFT' && <button className="project-primary-button" type="button" onClick={() => void setStatus(order, 'ORDERED')}>Marcar ordenada</button>}
              {(order.status === 'DRAFT' || order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED') && <button className="project-secondary-button" type="button" onClick={() => void setStatus(order, 'CANCELLED')}>Cancelar orden</button>}
              {(order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED') && (
                ['ADMIN', 'GERENTE', 'ALMACEN'].includes(sessionStorage.getItem('user_role') ?? '')
                  ? <button className="purchasing-report-link" onClick={() => navigateToReceivingOrder(order.id)} type="button">Registrar recepción</button>
                  : <span className="purchasing-stage-note">Pendiente de recepción por Almacén</span>
              )}
              <span>{order.receipts.length} recepciones</span>
            </div>
          </article>)}
        </div>
      )}
      {!loading && total > 0 && (
        <PaginationControls page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
      )}
    </section>
  )
}

function purchaseOrderExportSheets(orders: PurchaseOrder[]) {
  return [
    {
      name: 'Órdenes',
      columns: ['ID', 'Proveedor', 'Estado', 'Creada', 'Entrega esperada', 'Notas'],
      rows: orders.map((order) => [
        order.id,
        order.supplier.name,
        statusLabels[order.status],
        new Intl.DateTimeFormat('es').format(new Date(order.createdAt)),
        order.expectedAt ? new Intl.DateTimeFormat('es').format(new Date(order.expectedAt)) : '',
        order.notes ?? '',
      ]),
    },
    {
      name: 'Materiales solicitados',
      columns: ['ID de orden', 'Proveedor', 'Estado', 'Material', 'Cantidad solicitada', 'Unidad', 'Cantidad recibida', 'Costo cotizado unitario', 'Total cotizado'],
      rows: orders.flatMap((order) => order.items.map((item) => [
        order.id,
        order.supplier.name,
        statusLabels[order.status],
        item.material.name,
        Number(item.quantity),
        item.material.unit,
        Number(item.receivedQuantity),
        Number(item.unitCost),
        Number(item.quantity) * Number(item.unitCost),
      ])),
    },
  ]
}
