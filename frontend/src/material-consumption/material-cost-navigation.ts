const materialIntentKey = 'material-consumption-intent'

export function canAccessMaterialConsumption(role: string | null): boolean {
  return role === 'ADMIN' || role === 'GERENTE' || role === 'PRODUCCION'
}

export function navigateToMaterialConsumption(materialId: string): void {
  sessionStorage.setItem(materialIntentKey, materialId)
  window.location.hash = 'material-consumption'
}

export function consumeMaterialIntent(): string | null {
  const materialId = sessionStorage.getItem(materialIntentKey)
  if (materialId) sessionStorage.removeItem(materialIntentKey)
  return materialId
}
