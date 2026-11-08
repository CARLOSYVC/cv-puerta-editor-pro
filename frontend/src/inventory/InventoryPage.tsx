import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { DataExportActions } from '../exports/DataExportActions'
import { PurchasingWorkflow } from '../purchase-orders/PurchasingWorkflow'
import { getMaterials, type Material } from '../services/materials'
import {
  createInventoryMovement,
  getPaginatedInventoryMovements,
  getPaginatedInventoryStock,
  getInventoryStock,
  getInventoryMovements,
  updateInventoryMovement,
  type InventoryStockLevel,
  type InventoryMovement,
  type InventoryMovementType,
  type UpdateInventoryMovementInput,
} from '../services/inventory'
import { PaginationControls } from '../shared/PaginationControls'
import { takeGlobalSearchQuery } from '../services/global-search'

const movementLabels: Record<InventoryMovementType, string> = {
  PURCHASE: 'ENTRADA',
  EXIT: 'SALIDA',
  ADJUSTMENT: 'AJUSTE',
  CONSUMPTION: 'CONSUMO',
  RETURN: 'DEVOLUCION',
}

const dateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocurrió un error. Inténtalo de nuevo.'
}

function formatAmount(value: number | string): string {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('es', { maximumFractionDigits: 2 }) : String(value)
}

function formatCost(value: number | string | null): string {
  if (value === null) return '—'
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value)
}

function inventoryExportSheets(
  stockLevels: InventoryStockLevel[],
  movements: InventoryMovement[],
) {
  return [
    {
      name: 'Existencias',
      columns: ['Material', 'Stock actual', 'Unidad', 'Stock mínimo', 'Estado'],
      rows: stockLevels.map((item) => [
        item.name,
        item.stock_actual,
        item.unit,
        Number(item.minimumStock),
        item.status,
      ]),
    },
    {
      name: 'Movimientos',
      columns: ['Fecha', 'Material', 'Tipo', 'Cantidad', 'Unidad', 'Costo unitario', 'Referencia', 'Creado por', 'Actualizado por'],
      rows: movements.map((movement) => [
        dateFormatter.format(new Date(movement.createdAt)),
        movement.material.name,
        movementLabels[movement.movementType],
        Number(movement.quantity),
        movement.material.unit,
        movement.unitCost === null ? '' : Number(movement.unitCost),
        movement.reference ?? '',
        movement.createdBy?.name ?? movement.createdBy?.email ?? '',
        movement.updatedBy?.name ?? movement.updatedBy?.email ?? '',
      ]),
    },
  ]
}

export function InventoryPage() {
  const [token] = useState(() => sessionStorage.getItem('access_token'))
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [stockLevels, setStockLevels] = useState<InventoryStockLevel[]>([])
  const [materialOptions, setMaterialOptions] = useState<Material[]>([])
  const [stockQuery, setStockQuery] = useState('')
  const [movementQuery, setMovementQuery] = useState(takeGlobalSearchQuery)
  const [stockPage, setStockPage] = useState(1)
  const [movementPage, setMovementPage] = useState(1)
  const [stockTotal, setStockTotal] = useState(0)
  const [movementTotal, setMovementTotal] = useState(0)
  const [stockTotalPages, setStockTotalPages] = useState(1)
  const [movementTotalPages, setMovementTotalPages] = useState(1)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [movementFormOpen, setMovementFormOpen] = useState(false)
  const [movementType, setMovementType] = useState<'EXIT' | 'ADJUSTMENT' | 'RETURN'>('ADJUSTMENT')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [savingMovement, setSavingMovement] = useState(false)
  const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null)
  const [editForm, setEditForm] = useState<UpdateInventoryMovementInput>({
    quantity: 0,
    unitCost: null,
    reference: null,
    notes: null,
  })
  const [savingEdit, setSavingEdit] = useState(false)

  const exportSheets = inventoryExportSheets(stockLevels, movements)

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setLoading(true)
    Promise.all([
      getPaginatedInventoryStock({ query: stockQuery, page: stockPage, pageSize: 25 }),
      getPaginatedInventoryMovements({ query: movementQuery, page: movementPage, pageSize: 25 }),
      getMaterials(),
    ])
      .then(([stockResult, movementResult, materials]) => {
        if (cancelled) return
        setStockLevels(stockResult.items)
        setStockTotal(stockResult.total)
        setStockTotalPages(stockResult.totalPages)
        setStockPage(stockResult.page)
        setMovements(movementResult.items)
        setMovementTotal(movementResult.total)
        setMovementTotalPages(movementResult.totalPages)
        setMovementPage(movementResult.page)
        setMaterialOptions(materials)
        setMaterialId((current) => current || materials[0]?.id || '')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(getErrorMessage(cause))
        if (cause instanceof ApiError && cause.status === 401) {
          sessionStorage.removeItem('access_token')
          setMovements([])
          setStockLevels([])
          setSessionExpired(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, refreshKey, stockQuery, stockPage, movementQuery, movementPage])

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingMovement(true)
    setFormError('')
    try {
      await createInventoryMovement({
        eventUuid: crypto.randomUUID(),
        materialId,
        movementType,
        quantity: Number(quantity),
        ...(unitCost === '' ? {} : { unitCost: Number(unitCost) }),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      setQuantity('')
      setUnitCost('')
      setReference('')
      setNotes('')
      setMovementFormOpen(false)
      setLoading(true)
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setFormError(getErrorMessage(cause))
      if (cause instanceof ApiError && cause.status === 401) {
        sessionStorage.removeItem('access_token')
        setSessionExpired(true)
        setError(getErrorMessage(cause))
      }
    } finally {
      setSavingMovement(false)
    }
  }

  function openEditMovement(movement: InventoryMovement) {
    setEditingMovement(movement)
    setEditForm({
      quantity: Number(movement.quantity),
      unitCost: movement.unitCost === null ? null : Number(movement.unitCost),
      reference: movement.reference,
      notes: movement.notes,
    })
    setFormError('')
  }

  async function submitMovementEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMovement) return
    setSavingEdit(true)
    setFormError('')
    try {
      const updated = await updateInventoryMovement(editingMovement.id, editForm)
      setMovements((current) =>
        current.map((item) => item.id === updated.id ? updated : item),
      )
      setEditingMovement(null)
      setLoading(true)
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setFormError(getErrorMessage(cause))
      if (cause instanceof ApiError && cause.status === 401) {
        sessionStorage.removeItem('access_token')
        setSessionExpired(true)
        setError(getErrorMessage(cause))
      }
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section aria-labelledby="inventory-title" className="projects-page">
      <div className="page-heading projects-heading">
        <div>
          <div className="eyebrow">CONTROL DE EXISTENCIAS</div>
          <h1 id="inventory-title">Inventario</h1>
          <p>Consulta los movimientos y costos de tus materiales.</p>
        </div>
        {token && (
          <button
            className="project-primary-button"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              setError('')
              setSessionExpired(false)
              setRefreshKey((current) => current + 1)
            }}
            type="button"
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        )}
      </div>
      {token && <PurchasingWorkflow current="inventory" />}

      {!token ? (
        <div className="projects-state projects-empty-state">
          <h2>Inicia sesión para consultar el inventario</h2>
          <p>Accede desde la sección de materiales para ver los movimientos.</p>
          <a className="project-primary-button inventory-sign-in" href="#materials">
            Ir a Materials
          </a>
        </div>
      ) : error ? (
        <div className="projects-error projects-page-error" role="alert">
          {error}
          {sessionExpired && (
            <span> Tu sesión expiró. <a href="#materials">Inicia sesión nuevamente desde Materials.</a></span>
          )}
        </div>
      ) : loading ? (
        <div className="projects-state" role="status">Cargando inventario…</div>
      ) : (
        <>
          <div className="module-export-row">
            <DataExportActions
              fileName="inventario"
              sheets={exportSheets}
              loadSheets={async () => {
                const [allStock, allMovements] = await Promise.all([
                  getInventoryStock(),
                  getInventoryMovements(),
                ])
                return inventoryExportSheets(allStock, allMovements)
              }}
            />
          </div>
          <div className="inventory-section-heading">
            <h2>Existencias</h2>
            <div className="inventory-heading-details">
              <span>{stockTotal} materiales</span>
              <div aria-label="Estados de inventario" className="inventory-status-legend">
                <span className="inventory-stock-status inventory-stock-in_stock">🟢 OK</span>
                <span className="inventory-stock-status inventory-stock-low_stock">🟡 Bajo</span>
                <span className="inventory-stock-status inventory-stock-critical">🔴 Crítico</span>
              </div>
            </div>
          </div>
          <div className="projects-toolbar">
            <label className="projects-search">
              <input
                aria-label="Buscar materiales en inventario"
                maxLength={120}
                onChange={(event) => {
                  setStockQuery(event.target.value)
                  setStockPage(1)
                }}
                placeholder="Buscar materiales…"
                value={stockQuery}
              />
            </label>
          </div>
          {stockLevels.length === 0 ? (
            <div className="projects-state">{stockQuery ? 'No se encontraron materiales.' : 'No hay materiales registrados.'}</div>
          ) : (
            <div className="projects-table-wrap">
              <table className="projects-table inventory-table">
                <thead>
                  <tr>
                    <th scope="col">Material</th>
                    <th scope="col">Stock Actual</th>
                    <th scope="col">Stock Mínimo</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLevels.map((item) => (
                    <tr key={item.id}>
                      <td><div className="project-name">{item.name}</div></td>
                      <td>{formatAmount(item.stock_actual)} {item.unit}</td>
                      <td>{formatAmount(item.minimumStock)} {item.unit}</td>
                      <td>
                        <span className={`inventory-stock-status inventory-stock-${item.status.toLowerCase()}`}>
                          {item.status === 'CRITICAL' ? '🔴 Crítico' : item.status === 'LOW_STOCK' ? '🟡 Bajo' : '🟢 OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && stockTotal > 0 && (
            <PaginationControls
              page={stockPage}
              total={stockTotal}
              totalPages={stockTotalPages}
              onPageChange={setStockPage}
            />
          )}

          <div className="inventory-section-heading inventory-movements-heading">
            <div>
              <h2>Inventory Movements</h2>
              <span>Las compras se registran desde Órdenes de compra y Recepciones. Para existencias iniciales, registra un ajuste positivo por material e indica su costo unitario y la referencia «Inventario inicial».</span>
            </div>
            <button
              className="project-primary-button"
              disabled={materialOptions.length === 0}
              onClick={() => {
                setFormError('')
                setMovementFormOpen((open) => !open)
              }}
              type="button"
            >
              {movementFormOpen ? 'Cancelar' : '+ Registrar movimiento'}
            </button>
          </div>
          {movementFormOpen && (
            <form className="consumption-form inventory-movement-form" onSubmit={(event) => void submitMovement(event)}>
              {formError && <div className="projects-error inventory-form-error" role="alert">{formError}</div>}
              <label>
                Material
                <select onChange={(event) => setMaterialId(event.target.value)} required value={materialId}>
                  {materialOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                </select>
              </label>
              <label>
                Tipo
                <select onChange={(event) => setMovementType(event.target.value as typeof movementType)} value={movementType}>
                  <option value="EXIT">Salida</option>
                  <option value="ADJUSTMENT">Ajuste</option>
                  <option value="RETURN">Devolución</option>
                </select>
              </label>
              <label>
                Cantidad {movementType === 'ADJUSTMENT' && <span className="optional-label">Usa negativo para reducir stock</span>}
                <input
                  max="999999999999.99"
                  min={movementType === 'ADJUSTMENT' ? '-999999999999.99' : '0.01'}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={quantity}
                />
              </label>
              <label>
                Costo unitario <span className="optional-label">Opcional</span>
                <input
                  max="9999999999.99"
                  min="0"
                  onChange={(event) => setUnitCost(event.target.value)}
                  step="0.01"
                  type="number"
                  value={unitCost}
                />
              </label>
              <label>
                Referencia <span className="optional-label">Opcional</span>
                <input maxLength={255} onChange={(event) => setReference(event.target.value)} value={reference} />
              </label>
              <label>
                Notas <span className="optional-label">Opcional</span>
                <input maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} />
              </label>
              <button className="project-primary-button" disabled={savingMovement} type="submit">
                {savingMovement ? 'Guardando…' : 'Guardar movimiento'}
              </button>
            </form>
          )}

          <div className="inventory-section-heading inventory-movements-heading">
            <h2>Movimientos recientes</h2>
            <span>{movementTotal} movimientos</span>
          </div>
          <div className="projects-toolbar">
            <label className="projects-search">
              <input
                aria-label="Buscar movimientos de inventario"
                maxLength={120}
                onChange={(event) => {
                  setMovementQuery(event.target.value)
                  setMovementPage(1)
                }}
                placeholder="Buscar por material, referencia o notas…"
                value={movementQuery}
              />
            </label>
          </div>
          {movements.length === 0 ? (
            <div className="projects-state">{movementQuery ? 'No se encontraron movimientos.' : 'No hay movimientos registrados.'}</div>
          ) : (
            <div className="projects-table-wrap">
              <table className="projects-table inventory-table">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Material</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Costo Unitario</th>
                    <th scope="col">Referencia</th>
                    <th scope="col">Creado por</th>
                    <th scope="col">Actualizado por</th>
                    <th scope="col"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{dateFormatter.format(new Date(movement.createdAt))}</td>
                      <td><div className="project-name">{movement.material.name}</div></td>
                      <td>
                        <span className={`inventory-movement-type inventory-movement-${movement.movementType.toLowerCase()}`}>
                          {movementLabels[movement.movementType]}
                        </span>
                      </td>
                      <td>{formatAmount(movement.quantity)} {movement.material.unit}</td>
                      <td>{formatCost(movement.unitCost)}</td>
                      <td>{movement.reference || '—'}</td>
                      <td>{movement.createdBy?.name || movement.createdBy?.email || '—'}</td>
                      <td>{movement.updatedBy?.name || movement.updatedBy?.email || '—'}</td>
                      <td>
                        <button
                          aria-label={`Editar movimiento de ${movement.material.name}`}
                          className="project-icon-button"
                          onClick={() => openEditMovement(movement)}
                          type="button"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && movementTotal > 0 && (
            <PaginationControls
              page={movementPage}
              total={movementTotal}
              totalPages={movementTotalPages}
              onPageChange={setMovementPage}
            />
          )}
        </>
      )}
      {editingMovement && (
        <div
          className="project-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingEdit) {
              setEditingMovement(null)
            }
          }}
        >
          <section
            aria-labelledby="inventory-movement-edit-title"
            aria-modal="true"
            className="project-modal"
            role="dialog"
          >
            <div className="project-modal-header">
              <div>
                <div className="eyebrow">EDITAR MOVIMIENTO</div>
                <h2 id="inventory-movement-edit-title">{editingMovement.material.name}</h2>
                <p className="project-description">
                  {movementLabels[editingMovement.movementType]} · {editingMovement.material.unit}
                </p>
              </div>
              <button
                aria-label="Cerrar diálogo"
                className="project-modal-close"
                disabled={savingEdit}
                onClick={() => setEditingMovement(null)}
                type="button"
              >
                ×
              </button>
            </div>
            {formError && <div className="projects-error" role="alert">{formError}</div>}
            <form className="projects-form project-editor-form" onSubmit={(event) => void submitMovementEdit(event)}>
              <label>
                Cantidad
                <input
                  max="999999999999.99"
                  disabled={editingMovement.movementType === 'PURCHASE'}
                  min={editingMovement.movementType === 'ADJUSTMENT' ? '-999999999999.99' : '0.01'}
                  onChange={(event) =>
                    setEditForm({ ...editForm, quantity: Number(event.target.value) })
                  }
                  required
                  step="0.01"
                  type="number"
                  value={editForm.quantity}
                />
              </label>
              <label>
                Costo unitario <span className="optional-label">Opcional</span>
                <input
                  max="9999999999.99"
                  disabled={editingMovement.movementType === 'PURCHASE' || editingMovement.movementType === 'CONSUMPTION'}
                  min="0"
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      unitCost: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  step="0.01"
                  type="number"
                  value={editForm.unitCost ?? ''}
                />
              </label>
              <label>
                Referencia <span className="optional-label">Opcional</span>
                <input
                  maxLength={255}
                  onChange={(event) => setEditForm({ ...editForm, reference: event.target.value || null })}
                  value={editForm.reference ?? ''}
                />
              </label>
              <label>
                Notas <span className="optional-label">Opcional</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setEditForm({ ...editForm, notes: event.target.value || null })}
                  rows={3}
                  value={editForm.notes ?? ''}
                />
              </label>
              <div className="project-modal-actions">
                <button className="project-secondary-button" disabled={savingEdit} onClick={() => setEditingMovement(null)} type="button">
                  Cancelar
                </button>
                <button className="project-primary-button" disabled={savingEdit} type="submit">
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
