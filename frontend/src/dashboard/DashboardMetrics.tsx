import { useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { getDashboardMetrics, type DashboardMetrics as DashboardMetricsData } from '../services/dashboard'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudieron cargar las métricas.'
}

function formatCost(value: number | string): string {
  return Number(value).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function DashboardMetrics() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [metrics, setMetrics] = useState<DashboardMetricsData | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getDashboardMetrics()
      .then((result) => {
        if (!cancelled) setMetrics(result)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(getErrorMessage(cause))
        if (cause instanceof ApiError && cause.status === 401) {
          sessionStorage.removeItem('access_token')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const sections: Array<{
    title: string
    cards: Array<{
      label: string
      value: number | string | undefined
      tone: string
      note?: string
    }>
  }> = [
    {
      title: 'Inventario',
      cards: [
        {
          label: 'Costo inventario actual',
          value: metrics ? formatCost(metrics.inventoryCost) : undefined,
          tone: 'cost',
          note: 'Stock actual × costo promedio',
        },
        {
          label: 'Stock bajo',
          value: metrics?.lowStockMaterials,
          tone: 'low-stock',
          note: 'Existencias sobre cero y bajo el mínimo',
        },
        {
          label: 'Materiales Críticos',
          value: metrics?.criticalMaterials,
          tone: 'critical',
          note: 'Stock en cero o menor',
        },
      ],
    },
    {
      title: 'Compras',
      cards: [
        {
          label: 'Compras pendientes',
          value: metrics?.pendingPurchases,
          tone: 'purchases',
          note: 'Borrador, ordenadas o parcialmente recibidas',
        },
        {
          label: 'Compras del mes',
          value: metrics ? formatCost(metrics.monthlyPurchases) : undefined,
          tone: 'purchases',
          note: 'Recepciones reales del mes',
        },
        {
          label: 'Órdenes de compra atrasadas',
          value: metrics?.overduePurchaseOrders,
          tone: 'critical',
          note: 'Fecha esperada vencida',
        },
        {
          label: 'Recepciones pendientes',
          value: metrics?.pendingReceipts,
          tone: 'receipts',
          note: 'Órdenes enviadas con cantidades por recibir',
        },
      ],
    },
    {
      title: 'Costos',
      cards: [
        {
          label: 'Ventas estimadas',
          value: metrics ? formatCost(metrics.estimatedSales) : undefined,
          tone: 'purchases',
          note: 'Suma estimada de todos los proyectos',
        },
        {
          label: 'Costo producción',
          value: metrics ? formatCost(metrics.productionCost) : undefined,
          tone: 'cost',
          note: 'Costos históricos registrados en todos los periodos',
        },
        {
          label: 'Utilidad estimada',
          value: metrics ? formatCost(metrics.estimatedProfit) : undefined,
          tone: 'cost',
          note: 'Ventas estimadas menos costo de producción',
        },
        {
          label: 'Margen %',
          value: metrics ? `${Number(metrics.estimatedMargin).toLocaleString('es', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%` : undefined,
          tone: 'cost',
          note: 'Utilidad estimada ÷ ventas estimadas',
        },
        {
          label: 'Costo promedio por proyecto',
          value: metrics ? formatCost(metrics.averageProductionCostPerProject) : undefined,
          tone: 'cost',
          note: 'Costo histórico promedio entre proyectos con consumos',
        },
        {
          label: 'Costo de producción del mes',
          value: metrics ? formatCost(metrics.monthlyProductionCost) : undefined,
          tone: 'cost',
          note: 'Consumos del mes calendario',
        },
        {
          label: 'Costo promedio por orden',
          value: metrics ? formatCost(metrics.averageMonthlyProductionCostPerOrder) : undefined,
          tone: 'cost',
          note: 'Costo de producción mensual ÷ órdenes con consumos este mes',
        },
      ],
    },
    {
      title: 'Producción',
      cards: [
        {
          label: 'Consumos Mes',
          value: metrics?.monthlyConsumptions,
          tone: 'orders',
          note: 'Movimientos de consumo',
        },
        {
          label: 'Órdenes abiertas',
          value: metrics?.activeOrders,
          tone: 'orders',
          note: 'Planificadas o en curso',
        },
      ],
    },
    {
      title: 'Clientes y proyectos',
      cards: [
        {
          label: 'Clientes activos',
          value: metrics?.activeClients,
          tone: 'orders',
          note: 'Con al menos un proyecto en curso',
        },
        {
          label: 'Proyectos activos',
          value: metrics?.activeProjects,
          tone: 'orders',
          note: 'Estado en curso',
        },
      ],
    },
  ]

  const materialRanking = (metrics?.topConsumedMaterials ?? []).map((material) => ({
    id: material.materialId,
    name: material.material,
    detail: `${Number(material.quantity).toLocaleString('es', { maximumFractionDigits: 2 })} ${material.unit}`,
    value: formatCost(material.totalCost),
  }))
  const supplierPurchases = (metrics?.monthlyPurchasesBySupplier ?? []).map((supplier) => ({
    id: supplier.supplierId,
    name: supplier.supplier,
    detail: '',
    value: formatCost(supplier.total),
  }))
  const projectCosts = (metrics?.monthlyProductionCostsByProject ?? []).map((project) => ({
    id: project.projectId,
    name: project.project,
    detail: '',
    value: formatCost(project.totalCost),
  }))
  const recentConsumptionDays = (metrics?.consumptionLast30Days ?? []).map((day) => ({
    id: day.date,
    name: new Intl.DateTimeFormat('es', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day.date}T12:00:00Z`)),
    detail: `${day.movementCount} consumos`,
    value: formatCost(day.totalCost),
  }))
  const statusLabels = {
    PLANNED: 'Planificadas',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completadas',
    CANCELLED: 'Canceladas',
  } as const
  const productionStatuses = (metrics?.productionStatusBreakdown ?? []).map((item) => ({
    id: item.status,
    name: statusLabels[item.status],
    detail: '',
    value: String(item.count),
  }))
  const alerts = [
    {
      label: 'Materiales críticos',
      count: metrics?.criticalMaterials,
      tone: 'critical',
      description: 'Stock en cero o menor',
    },
    {
      label: 'Compras atrasadas',
      count: metrics?.overduePurchaseOrders,
      tone: 'warning',
      description: 'Órdenes con fecha esperada vencida',
    },
    {
      label: 'Recepciones pendientes',
      count: metrics?.pendingReceipts,
      tone: 'warning',
      description: 'Órdenes enviadas con cantidades por recibir',
    },
    {
      label: 'Órdenes detenidas',
      count: metrics?.cancelledProductionOrders,
      tone: 'critical',
      description: 'Órdenes de producción canceladas',
    },
  ]

  function renderRanking(
    title: string,
    subtitle: string,
    loadingText: string,
    emptyText: string,
    items: Array<{ id: string; name: string; detail: string; value: string }>,
  ) {
    return (
      <div className="dashboard-suppliers">
        <div className="dashboard-suppliers-heading">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {loading ? (
          <div className="dashboard-suppliers-empty">{loadingText}</div>
        ) : items.length ? (
          <ol>
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name}{item.detail ? ` · ${item.detail}` : ''}
                </span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <div className="dashboard-suppliers-empty">{emptyText}</div>
        )}
      </div>
    )
  }

  return (
    <section aria-label="Indicadores de operaciones">
      {!token && (
        <div className="dashboard-auth-notice" role="status">
          Inicia sesión desde Materials para cargar indicadores reales.
          <a href="#materials"> Iniciar sesión</a>
        </div>
      )}
      {error && (
        <div className="projects-error dashboard-metrics-error" role="alert">
          {error}
          {error.includes('401') && <a href="#materials"> Inicia sesión de nuevo desde Materials.</a>}
        </div>
      )}
      <section aria-label="Alertas operativas" className="dashboard-alerts">
        <h2>Alertas operativas</h2>
        {loading ? (
          <div className="dashboard-alerts-empty" role="status">Cargando alertas…</div>
        ) : alerts.some((alert) => alert.count) ? (
          <div className="dashboard-alerts-grid">
            {alerts.filter((alert) => alert.count).map((alert) => (
              <article className={`dashboard-alert dashboard-alert-${alert.tone}`} key={alert.label}>
                <span aria-hidden="true">{alert.tone === 'critical' ? '🔴' : '🟡'}</span>
                <div>
                  <strong>{alert.label}</strong>
                  <span>{alert.description}</span>
                </div>
                <b>{alert.count}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-alerts-empty">No hay alertas operativas activas.</div>
        )}
      </section>
      {sections.map((section) => (
        <section
          aria-label={section.title}
          className="dashboard-kpi-section"
          key={section.title}
        >
          <div className="dashboard-kpi-heading">
            <h2>{section.title}</h2>
          </div>
          <div className="dashboard-metrics-grid">
            {section.cards.map((card) => (
              <article className={`dashboard-metric-card dashboard-metric-${card.tone}`} key={card.label}>
                <span className="dashboard-metric-label">{card.label}</span>
                <strong>{loading ? '…' : card.value === undefined ? '—' : card.value}</strong>
                {card.note && <span className="dashboard-metric-note">{card.note}</span>}
              </article>
            ))}
          </div>
          {section.title === 'Costos' && (
            <div className="dashboard-rankings">
              {renderRanking(
                'Top 10 Materiales Consumidos',
                'Por costo · mes calendario',
                'Calculando consumos…',
                'Sin consumos este mes.',
                materialRanking,
              )}
            </div>
          )}
        </section>
      ))}
      <section aria-label="Reportes de operación" className="dashboard-kpi-section">
        <div className="dashboard-kpi-heading">
          <h2>Reportes de operación</h2>
        </div>
        <div className="dashboard-reports-grid">
          {renderRanking(
            'Consumos últimos 30 días',
            'Costo y cantidad consumida por día',
            'Cargando consumos…',
            'Sin consumos en los últimos 30 días.',
            recentConsumptionDays,
          )}
          {renderRanking(
            'Compras por proveedor',
            'Recepciones reales · mes calendario actual',
            'Cargando compras…',
            'Sin compras recibidas este mes.',
            supplierPurchases,
          )}
          {renderRanking(
            'Costos por proyecto',
            'Consumos de producción · mes calendario actual',
            'Calculando costos…',
            'Sin costos de producción este mes.',
            projectCosts,
          )}
          {renderRanking(
            'Órdenes por estado',
            'Órdenes de producción · todos los periodos',
            'Cargando órdenes…',
            'No hay órdenes de producción.',
            productionStatuses,
          )}
        </div>
      </section>
    </section>
  )
}
