import { useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { getPurchasingReport, type PurchasingReport } from '../services/purchasing'

function amount(value: number | string): string {
  return Number(value).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PurchasingReportsPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [report, setReport] = useState<PurchasingReport | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getPurchasingReport()
      .then((result) => { if (!cancelled) setReport(result) })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los informes.')
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (!token) {
    return <section className="projects-page"><div className="page-heading"><div><div className="eyebrow">COMPRAS</div><h1>Reports</h1><p>Inicia sesión para consultar reportes de compras.</p></div></div><div className="projects-state projects-empty-state"><a className="project-primary-button inventory-sign-in" href="#materials">Ir a Materials para iniciar sesión</a></div></section>
  }

  return (
    <section aria-labelledby="purchasing-reports-title" className="projects-page">
      <div className="page-heading"><div><div className="eyebrow">COMPRAS</div><h1 id="purchasing-reports-title">Purchase Reports</h1><p>Resumen de recepciones y gasto por proveedor y material.</p></div></div>
      {error && <div className="projects-error projects-page-error" role="alert">{error}</div>}
      {loading ? <div className="projects-state" role="status">Generando informe…</div> : !report ? null : (
        <>
          <div className="purchasing-report-kpis">
            <article className="dashboard-metric-card"><span className="dashboard-metric-label">Gasto mensual</span><strong>{amount(report.monthlySpend)}</strong><span className="dashboard-metric-note">Mes calendario actual</span></article>
            <article className="dashboard-metric-card"><span className="dashboard-metric-label">Costo promedio por proveedor</span><strong>{amount(report.averageSupplierCost)}</strong><span className="dashboard-metric-note">Gasto mensual / proveedores con recepciones</span></article>
            <article className="dashboard-metric-card"><span className="dashboard-metric-label">Material más comprado</span><strong className="purchasing-report-material">{report.topMonthlyMaterial?.material ?? '—'}</strong><span className="dashboard-metric-note">{report.topMonthlyMaterial ? amount(report.topMonthlyMaterial.total) : 'Sin compras este mes'}</span></article>
            <article className="dashboard-metric-card"><span className="dashboard-metric-label">Recepciones atrasadas</span><strong>{report.overdueReceipts}</strong><span className="dashboard-metric-note">Órdenes vencidas sin completar</span></article>
            <article className="dashboard-metric-card"><span className="dashboard-metric-label">Órdenes abiertas</span><strong>{report.openOrders}</strong><span className="dashboard-metric-note">Borrador, ordenadas o parciales</span></article>
          </div>
          <div className="costs-total-card"><span>Gasto total recibido histórico</span><strong>{amount(report.totalSpend)}</strong></div>
          {report.entries.length === 0 ? (
            <div className="projects-state projects-empty-state"><h2>Sin recepciones registradas</h2><p>Confirma recepciones de órdenes para generar informes.</p></div>
          ) : (
            <>
          <div className="inventory-section-heading inventory-movements-heading"><h2>Compras por proveedor</h2><span>{report.suppliers.length} proveedores</span></div>
          <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Proveedor</th><th>Líneas recibidas</th><th>Total histórico</th></tr></thead><tbody>{report.suppliers.map((supplier) => <tr key={supplier.supplierId}><td>{supplier.supplier}</td><td>{supplier.receipts}</td><td className="material-cost">{amount(supplier.total)}</td></tr>)}</tbody></table></div>
          <div className="inventory-section-heading inventory-movements-heading"><h2>Compras por material</h2><span>{report.materials.length} materiales</span></div>
          <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Material</th><th>Cantidad recibida</th><th>Total</th></tr></thead><tbody>{report.materials.map((material) => <tr key={material.materialId}><td>{material.material}</td><td>{amount(material.quantity)}</td><td className="material-cost">{amount(material.total)}</td></tr>)}</tbody></table></div>
          <div className="inventory-section-heading inventory-movements-heading"><h2>Detalle de recepciones</h2><span>{report.entries.length} líneas</span></div>
          <div className="projects-table-wrap"><table className="projects-table operations-table"><thead><tr><th>Fecha</th><th>Orden</th><th>Proveedor</th><th>Material</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th></tr></thead><tbody>{report.entries.map((entry, index) => <tr key={`${entry.receiptId}-${index}`}><td>{new Intl.DateTimeFormat('es').format(new Date(entry.createdAt))}</td><td>{entry.purchaseOrderId.slice(0, 8)}</td><td>{entry.supplier}</td><td>{entry.material}</td><td>{amount(entry.quantity)} {entry.unit}</td><td>{amount(entry.unitCost)}</td><td>{amount(entry.total)}</td></tr>)}</tbody></table></div>
            </>
          )}
        </>
      )}
    </section>
  )
}
