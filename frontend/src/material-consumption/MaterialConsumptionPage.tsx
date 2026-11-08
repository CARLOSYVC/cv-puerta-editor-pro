import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { MaterialCostWorkflow } from './MaterialCostWorkflow'
import { consumeMaterialIntent } from './material-cost-navigation'
import {
  createMaterialConsumption,
  getMaterialConsumptions,
  getPaginatedMaterialConsumptions,
  getOperationMaterials,
  getProductionOrders,
  type MaterialConsumption,
  type OperationMaterial,
  type ProductionOrder,
} from '../services/operations'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

function amount(value: number | string | null): string {
  return value === null ? '—' : Number(value).toLocaleString('es', { maximumFractionDigits: 2 })
}

function consumptionExportSheets(consumptions: MaterialConsumption[]) {
  return [{
    name: 'Consumos',
    columns: ['Orden de producción', 'Proyecto', 'Material', 'Cantidad', 'Unidad', 'Costo unitario', 'Referencia', 'Fecha'],
    rows: consumptions.map((item) => [
      item.productionOrder?.name ?? '',
      item.productionOrder?.project.name ?? '',
      item.material.name,
      Number(item.quantity),
      item.material.unit,
      item.unitCost === null ? 0 : Number(item.unitCost),
      item.reference ?? '',
      new Intl.DateTimeFormat('es').format(new Date(item.createdAt)),
    ]),
  }]
}

export function MaterialConsumptionPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [materials, setMaterials] = useState<OperationMaterial[]>([])
  const [consumptions, setConsumptions] = useState<MaterialConsumption[]>([])
  const [query, setQuery] = useState(takeGlobalSearchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [orderId, setOrderId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [lastConsumption, setLastConsumption] = useState<MaterialConsumption | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getProductionOrders(),
      getOperationMaterials(),
      getPaginatedMaterialConsumptions({ query, page, pageSize: 25 }),
    ])
      .then(([nextOrders, nextMaterials, consumptionResult]) => {
        if (cancelled) return
        setOrders(nextOrders)
        setMaterials(nextMaterials)
        setConsumptions(consumptionResult.items)
        setTotal(consumptionResult.total)
        setTotalPages(consumptionResult.totalPages)
        setPage(consumptionResult.page)
        setOrderId((current) => current || nextOrders[0]?.id || '')
        const materialIntent = consumeMaterialIntent()
        if (materialIntent) {
          if (nextMaterials.some((material) => material.id === materialIntent)) {
            setMaterialId(materialIntent)
          } else {
            setMaterialId('')
            setError('El material seleccionado ya no está disponible.')
          }
        } else {
          setMaterialId((current) => current || nextMaterials[0]?.id || '')
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(message(cause))
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, refresh, query, page])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setLastConsumption(null)
    try {
      const created = await createMaterialConsumption({
        productionOrderId: orderId,
        materialId,
        quantity,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      setLastConsumption(created)
      setQuantity(0)
      setReference('')
      setNotes('')
      setLoading(true)
      setRefresh((current) => current + 1)
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!token) return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">INVENTARIO</div><h1>Material Consumption</h1><p>Inicia sesión para registrar consumos.</p></div></div><div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>

  return (
    <section aria-labelledby="consumption-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">INVENTARIO</div><h1 id="consumption-title">Material Consumption</h1><p>Registra materiales utilizados; el costo se toma del promedio ponderado actual.</p></div></div>
      <MaterialCostWorkflow current="material-consumption" />
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      {lastConsumption && (
        <div className="projects-notice" role="status">
          Costo histórico registrado:{' '}
          {amount(lastConsumption.quantity)} {lastConsumption.material.unit}
          {' × '}{amount(lastConsumption.unitCost)}
          {' = '}{amount(Number(lastConsumption.quantity) * Number(lastConsumption.unitCost ?? 0))}.
          {' '}<a href="#costs">Ver costos históricos</a>
        </div>
      )}
      <form className="consumption-form projects-form" onSubmit={(event) => void submit(event)}>
        <label>Production Order<select onChange={(event) => setOrderId(event.target.value)} required value={orderId}><option value="">Seleccionar orden</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.name} — {order.project.name}</option>)}</select></label>
        <label>Material<select onChange={(event) => setMaterialId(event.target.value)} required value={materialId}><option value="">Seleccionar material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}</select></label>
        <label>Cantidad<input min="0.01" onChange={(event) => setQuantity(Number(event.target.value))} required step="0.01" type="number" value={quantity || ''} /></label>
        <label>Referencia <span className="optional-label">Opcional</span><input maxLength={255} onChange={(event) => setReference(event.target.value)} value={reference} /></label>
        <label className="consumption-notes">Notas <span className="optional-label">Opcional</span><input maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
        <button className="project-primary-button" disabled={saving || !orders.length || !materials.length} type="submit">{saving ? 'Guardando…' : 'Registrar consumo'}</button>
      </form>
      <div className="inventory-section-heading">
        <h2>Consumos registrados</h2>
        <div className="inventory-heading-details">
          <span>{total} registros</span>
          {!loading && consumptions.length > 0 && (
            <DataExportActions
              fileName="consumos"
              sheets={consumptionExportSheets(consumptions)}
              loadSheets={async () => consumptionExportSheets(await getMaterialConsumptions())}
            />
          )}
        </div>
      </div>
      <div className="projects-toolbar">
        <label className="projects-search">
          <input
            aria-label="Buscar consumos"
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por orden, proyecto, material o referencia…"
            value={query}
          />
        </label>
      </div>
      {loading ? <div className="projects-state" role="status">Cargando consumos…</div> : consumptions.length === 0 ? <div className="projects-state">{query ? 'No se encontraron consumos.' : 'No hay consumos registrados.'}</div> : (
        <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Orden / Project</th><th>Material</th><th>Cantidad</th><th>Costo unitario</th><th>Referencia</th><th>Fecha</th></tr></thead><tbody>
          {consumptions.map((item) => <tr key={item.id}><td><div className="project-name">{item.productionOrder?.name ?? '—'}</div><div className="project-description">{item.productionOrder?.project.name ?? ''}</div></td><td>{item.material.name}</td><td>{amount(item.quantity)} {item.material.unit}</td><td>{amount(item.unitCost)}</td><td>{item.reference || '—'}</td><td>{new Intl.DateTimeFormat('es').format(new Date(item.createdAt))}</td></tr>)}
        </tbody></table></div>
      )}
      {!loading && total > 0 && (
        <PaginationControls page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
      )}
    </section>
  )
}
