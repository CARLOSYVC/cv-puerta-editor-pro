type PurchasingStage = 'suppliers' | 'purchase-orders' | 'receiving' | 'inventory'

const stages: Array<{ id: PurchasingStage; label: string }> = [
  { id: 'suppliers', label: 'Proveedor' },
  { id: 'purchase-orders', label: 'Orden de compra' },
  { id: 'receiving', label: 'Recepción' },
  { id: 'inventory', label: 'Inventario' },
]

const roleStages: Record<string, readonly PurchasingStage[]> = {
  ADMIN: stages.map((stage) => stage.id),
  GERENTE: stages.map((stage) => stage.id),
  COMPRAS: ['suppliers', 'purchase-orders'],
  ALMACEN: ['receiving', 'inventory'],
}

export function PurchasingWorkflow({ current }: { current: PurchasingStage }) {
  const role = sessionStorage.getItem('user_role') ?? ''
  const accessibleStages = roleStages[role] ?? []

  return (
    <nav aria-label="Flujo de compras" className="purchasing-workflow">
      {stages.map((stage, index) => (
        <span className="purchasing-workflow-item" key={stage.id}>
          {accessibleStages.includes(stage.id) ? (
            <a
              aria-current={current === stage.id ? 'step' : undefined}
              className={current === stage.id ? 'purchasing-workflow-current' : undefined}
              href={`#${stage.id}`}
            >
              {stage.label}
            </a>
          ) : (
            <span aria-label={`${stage.label}, continúa el equipo de almacén o compras`}>
              {stage.label}
            </span>
          )}
          {index < stages.length - 1 && <span aria-hidden="true">→</span>}
        </span>
      ))}
    </nav>
  )
}
