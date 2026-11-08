import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { MaterialCostWorkflow } from '../material-consumption/MaterialCostWorkflow'
import { canAccessMaterialConsumption } from '../material-consumption/material-cost-navigation'
import { consumeReceivingOrderIntent } from '../purchase-orders/purchasing-navigation'
import { PurchasingWorkflow } from '../purchase-orders/PurchasingWorkflow'
import {
  getReceivableOrders,
  receivePurchaseOrder,
  type PurchaseOrder,
} from '../services/purchasing'

function amount(value: number | string): string {
  return Number(value).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ReceivingPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [receivingId, setReceivingId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [actualUnitCosts, setActualUnitCosts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [receiptCompleted, setReceiptCompleted] = useState(false)

  const openReceipt = useCallback((order: PurchaseOrder) => {
    setReceiptCompleted(false)
    setReceivingId(order.id)
    setReference('')
    setNotes('')
    setActualUnitCosts(Object.fromEntries(order.items.map((item) => [
      item.id,
      String(item.unitCost),
    ])))
    setQuantities(Object.fromEntries(order.items.map((item) => [
      item.id,
      String(Math.max(0, Number(item.quantity) - Number(item.receivedQuantity))),
    ])))
  }, [])

  const exportSheets = [
    {
      name: 'Recepciones pendientes',
      columns: ['ID de orden', 'Proveedor', 'Estado', 'Fecha de orden', 'Entrega esperada'],
      rows: orders.map((order) => [
        order.id,
        order.supplier.name,
        order.status === 'PARTIALLY_RECEIVED' ? 'Recibida parcialmente' : 'Pendiente',
        new Intl.DateTimeFormat('es').format(new Date(order.createdAt)),
        order.expectedAt ? new Intl.DateTimeFormat('es').format(new Date(order.expectedAt)) : '',
      ]),
    },
    {
      name: 'Materiales pendientes',
      columns: ['ID de orden', 'Proveedor', 'Material', 'Cantidad pedida', 'Unidad', 'Cantidad recibida', 'Cantidad pendiente'],
      rows: orders.flatMap((order) => order.items.map((item) => [
        order.id,
        order.supplier.name,
        item.material.name,
        Number(item.quantity),
        item.material.unit,
        Number(item.receivedQuantity),
        Number(item.quantity) - Number(item.receivedQuantity),
      ])),
    },
  ]

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getReceivableOrders()
      .then((result) => {
        if (cancelled) return
        setOrders(result)
        const orderId = consumeReceivingOrderIntent()
        if (orderId) {
          const order = result.find((item) => item.id === orderId)
          if (order) {
            openReceipt(order)
            window.setTimeout(() => {
              document.getElementById(`receiving-order-${orderId}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }, 0)
          } else {
            setError('La orden seleccionada no tiene recepciones pendientes.')
          }
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las recepciones.')
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [openReceipt, token])

  async function submit(event: FormEvent<HTMLFormElement>, order: PurchaseOrder) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const items = order.items
        .map((item) => ({
          purchaseOrderItemId: item.id,
          quantity: Number(quantities[item.id] ?? 0),
          actualUnitCost: Number(actualUnitCosts[item.id] ?? item.unitCost),
        }))
        .filter((item) => item.quantity > 0)
      if (items.length === 0) {
        setError('Ingresa una cantidad recibida mayor que cero.')
        return
      }
      const result = await receivePurchaseOrder(order.id, {
        ...(reference && { reference }),
        ...(notes && { notes }),
        items,
      })
      if (result.purchaseOrder.status === 'RECEIVED') {
        setOrders((current) => current.filter((item) => item.id !== result.purchaseOrder.id))
      } else {
        setOrders((current) => current.map((item) =>
          item.id === result.purchaseOrder.id ? result.purchaseOrder : item,
        ))
      }
      setReceivingId('')
      setReceiptCompleted(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la recepción.')
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <section className="projects-page">
        <div className="page-heading"><div><div className="eyebrow">ALMACÉN</div><h1>Recepciones</h1><p>Inicia sesión para registrar entregas.</p></div></div>
        <div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div>
      </section>
    )
  }

  return (
    <section aria-labelledby="receiving-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">ALMACÉN</div><h1 id="receiving-title">Recepciones</h1><p>Registra cantidades y costos reales recibidos. El inventario y su costo promedio se actualizan automáticamente.</p></div></div>
      <PurchasingWorkflow current="receiving" />
      <MaterialCostWorkflow current="receiving" />
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      {receiptCompleted && (
        <div className="projects-notice" role="status">
          Recepción registrada; el costo promedio se actualizó automáticamente.{' '}
          <a className="purchasing-report-link" href="#materials">Ver costo promedio</a>
          {canAccessMaterialConsumption(sessionStorage.getItem('user_role')) && (
            <> · <a className="purchasing-report-link" href="#material-consumption">Registrar consumo</a></>
          )}
        </div>
      )}
      {loading ? <div className="projects-state" role="status">Cargando órdenes por recibir…</div> : orders.length === 0 ? (
        <div className="projects-state projects-empty-state"><h2>Sin entregas pendientes</h2><p>No hay órdenes abiertas que requieran recepción.</p></div>
      ) : (
        <>
        <div className="module-export-row">
          <DataExportActions fileName="recepciones-pendientes" sheets={exportSheets} />
        </div>
        <div className="purchase-order-list">
          {orders.map((order) => <article className="purchase-order-card" id={`receiving-order-${order.id}`} key={order.id}>
            <div className="purchase-order-header">
              <div><h3>{order.supplier.name}</h3><span>Orden {order.id.slice(0, 8)} · {new Intl.DateTimeFormat('es').format(new Date(order.createdAt))}{order.expectedAt ? ` · Esperada ${new Intl.DateTimeFormat('es').format(new Date(order.expectedAt))}` : ''}</span></div>
              <span className="supplier-status purchase-status-ordered">{order.status === 'PARTIALLY_RECEIVED' ? 'Recibida parcialmente' : 'Pendiente'}</span>
            </div>
            <div className="projects-table-wrap purchase-items-table"><table className="projects-table operations-table"><thead><tr><th>Material</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.material.name}</td><td>{amount(item.quantity)} {item.material.unit}</td><td>{amount(item.receivedQuantity)} {item.material.unit}</td><td>{amount(Number(item.quantity) - Number(item.receivedQuantity))} {item.material.unit}</td></tr>)}</tbody></table></div>
            <div className="purchase-order-actions">
              <button className="project-primary-button" type="button" onClick={() => receivingId === order.id ? setReceivingId('') : openReceipt(order)}>{receivingId === order.id ? 'Cerrar recepción' : 'Registrar recepción'}</button>
            </div>
            {receivingId === order.id && <form className="receiving-form" onSubmit={(event) => void submit(event, order)}>
              <h4>Detalle de entrega recibida</h4>
              <div className="supplier-fields">
                <label>Referencia de entrega<input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
                <label>Notas<input maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              </div>
              <div className="projects-table-wrap purchase-items-table"><table className="projects-table operations-table"><thead><tr><th>Material</th><th>Pendiente</th><th>Recibir ahora</th><th>Costo real unitario</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.material.name}</td><td>{amount(Number(item.quantity) - Number(item.receivedQuantity))} {item.material.unit}</td><td><input aria-label={`Cantidad recibida de ${item.material.name}`} className="receive-quantity" max={Number(item.quantity) - Number(item.receivedQuantity)} min="0" step="0.01" type="number" value={quantities[item.id] ?? '0'} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></td><td><input aria-label={`Costo real unitario de ${item.material.name}`} className="receive-quantity" max="9999999999.99" min="0" required step="0.01" type="number" value={actualUnitCosts[item.id] ?? ''} onChange={(event) => setActualUnitCosts((current) => ({ ...current, [item.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
              <div className="supplier-form-actions"><button className="project-primary-button" disabled={saving} type="submit">{saving ? 'Registrando…' : 'Confirmar recepción'}</button></div>
            </form>}
          </article>)}
        </div>
        </>
      )}
    </section>
  )
}
