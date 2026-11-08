import { useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { MaterialCostWorkflow } from '../material-consumption/MaterialCostWorkflow'
import { getCosts, type CostsReport } from '../services/operations'

function amount(value: number | string): string {
  return Number(value).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CostsPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [report, setReport] = useState<CostsReport | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCosts()
      .then((result) => { if (!cancelled) setReport(result) })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los costos.')
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (!token) return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">FINANZAS</div><h1>Costs</h1><p>Inicia sesión para consultar costos.</p></div></div><div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>

  return (
    <section aria-labelledby="costs-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">FINANZAS</div><h1 id="costs-title">Costs</h1><p>Cada consumo conserva el costo promedio ponderado vigente al registrarse; estos costos históricos no cambian con recepciones posteriores.</p></div></div>
      <MaterialCostWorkflow current="costs" />
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      {loading ? <div className="projects-state" role="status">Calculando costos…</div> : !report?.entries.length ? <div className="projects-state projects-empty-state"><h2>Sin costos registrados</h2><p>Registra consumos para generar el reporte de costos históricos.</p><a className="project-primary-button" href="#material-consumption">Ir a Consumo</a></div> : (
        <>
          <div className="module-export-row">
            <DataExportActions
              fileName="costos"
              sheets={[
                {
                  name: 'Costos por orden',
                  columns: ['Orden de producción', 'Proyecto', 'Costo total'],
                  rows: report.orders.map((order) => [
                    order.productionOrder,
                    order.project,
                    Number(order.totalCost),
                  ]),
                },
                {
                  name: 'Detalle de costos',
                  columns: ['Orden', 'Proyecto', 'Material', 'Cantidad', 'Unidad', 'Costo unitario', 'Costo total', 'Fecha'],
                  rows: report.entries.map((entry) => [
                    entry.productionOrder,
                    entry.project,
                    entry.material,
                    Number(entry.quantity),
                    entry.unit,
                    entry.unitCost === null ? 0 : Number(entry.unitCost),
                    Number(entry.totalCost),
                    new Intl.DateTimeFormat('es').format(new Date(entry.createdAt)),
                  ]),
                },
              ]}
            />
          </div>
          <div className="costs-total-card"><span>Costo total de materiales</span><strong>{amount(report.totalCost)}</strong></div>
          <div className="inventory-section-heading"><h2>Costos por orden</h2><span>{report.orders.length} órdenes</span></div>
          <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Production Order</th><th>Project</th><th>Costo total</th></tr></thead><tbody>{report.orders.map((order) => <tr key={order.productionOrderId}><td><div className="project-name">{order.productionOrder}</div></td><td>{order.project}</td><td className="material-cost">{amount(order.totalCost)}</td></tr>)}</tbody></table></div>
          <div className="inventory-section-heading inventory-movements-heading"><h2>Detalle de costos</h2><span>{report.entries.length} consumos</span></div>
          <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Orden</th><th>Material</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Fecha</th></tr></thead><tbody>{report.entries.map((entry) => <tr key={entry.id}><td>{entry.productionOrder}</td><td>{entry.material}</td><td>{amount(entry.quantity)} {entry.unit}</td><td>{amount(entry.unitCost ?? 0)}</td><td className="material-cost">{amount(entry.totalCost)}</td><td>{new Intl.DateTimeFormat('es').format(new Date(entry.createdAt))}</td></tr>)}</tbody></table></div>
        </>
      )}
    </section>
  )
}
