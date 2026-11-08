import { useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { getPurchasingMetrics, type PurchasingMetrics as PurchasingMetricsData } from '../services/purchasing'

function amount(value: number | string): string {
  return Number(value).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PurchasingMetrics() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [metrics, setMetrics] = useState<PurchasingMetricsData | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getPurchasingMetrics()
      .then((result) => { if (!cancelled) setMetrics(result) })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los indicadores de compras.')
        if (cause instanceof ApiError && cause.status === 401) sessionStorage.removeItem('access_token')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const cards = [
    { label: 'Proveedores activos', value: metrics?.activeSuppliers },
    { label: 'Órdenes abiertas', value: metrics?.openOrders },
    { label: 'Órdenes atrasadas', value: metrics?.overdueOrders },
    { label: 'Recepciones del mes', value: metrics?.monthlyReceipts },
    { label: 'Gasto recibido este mes', value: metrics ? amount(metrics.monthlySpend) : undefined },
  ]

  return (
    <section aria-label="Indicadores de compras" className="purchasing-metrics-section">
      <div className="section-heading purchasing-metrics-heading"><div><h2>Compras</h2><p>Actividad de proveedores y recepciones del mes.</p></div><a className="purchasing-report-link" href="#reports">Ver informes</a></div>
      {error && <div className="projects-error dashboard-metrics-error" role="alert">{error}</div>}
      <div className="dashboard-metrics-grid purchasing-metrics-grid">{cards.map((card) => <article className="dashboard-metric-card" key={card.label}><span className="dashboard-metric-label">{card.label}</span><strong>{loading ? '…' : card.value === undefined ? '—' : card.value}</strong></article>)}</div>
      {!token && <div className="dashboard-auth-notice" role="status">Inicia sesión para cargar los indicadores de compras. <a href="#materials">Iniciar sesión</a></div>}
    </section>
  )
}
