interface PaginationControlsProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationControlsProps) {
  if (total === 0) return null

  return (
    <nav aria-label="Paginación" className="pagination-controls">
      <button
        className="project-secondary-button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Anterior
      </button>
      <span aria-live="polite">
        Página {page} de {totalPages} · {total} resultados
      </span>
      <button
        className="project-secondary-button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Siguiente
      </button>
    </nav>
  )
}
