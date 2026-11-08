const projectIntentKey = 'production-order-project-intent'

export function navigateToProductionOrder(projectId: string): void {
  sessionStorage.setItem(projectIntentKey, projectId)
  window.location.hash = 'production-orders'
}

export function consumeProductionOrderProjectIntent(): string | null {
  const projectId = sessionStorage.getItem(projectIntentKey)
  if (projectId) sessionStorage.removeItem(projectIntentKey)
  return projectId
}
