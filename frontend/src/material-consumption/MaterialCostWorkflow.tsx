type WorkflowStage = 'receiving' | 'materials' | 'material-consumption' | 'costs'

const stages: Array<{ id: WorkflowStage; label: string }> = [
  { id: 'receiving', label: 'Recepción parcial' },
  { id: 'materials', label: 'Costo promedio' },
  { id: 'material-consumption', label: 'Consumo' },
  { id: 'costs', label: 'Costo histórico' },
]

const roleStages: Record<string, readonly WorkflowStage[]> = {
  ADMIN: stages.map((stage) => stage.id),
  GERENTE: stages.map((stage) => stage.id),
  ALMACEN: ['receiving', 'materials'],
  PRODUCCION: ['material-consumption', 'costs'],
}

export function MaterialCostWorkflow({ current }: { current: WorkflowStage }) {
  const role = sessionStorage.getItem('user_role') ?? ''
  const accessibleStages = roleStages[role] ?? []

  return (
    <nav aria-label="Flujo de recepción, costo promedio, consumo y costo histórico" className="purchasing-workflow">
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
            <span>{stage.label}</span>
          )}
          {index < stages.length - 1 && <span aria-hidden="true">→</span>}
        </span>
      ))}
    </nav>
  )
}
