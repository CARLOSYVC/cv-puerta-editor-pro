export type ProjectNavigationIntent =
  | { type: 'view-client'; clientId: string }
  | { type: 'create-for-client'; clientId: string }
  | { type: 'view-project'; projectId: string }

const navigationIntentKey = 'project-navigation-intent'

export function navigateToProjectIntent(intent: ProjectNavigationIntent): void {
  sessionStorage.setItem(navigationIntentKey, JSON.stringify(intent))
  window.location.hash = 'projects'
}

export function getProjectNavigationIntent(): ProjectNavigationIntent | null {
  const serializedIntent = sessionStorage.getItem(navigationIntentKey)
  if (!serializedIntent) return null

  try {
    const intent: unknown = JSON.parse(serializedIntent)
    if (typeof intent === 'object' && intent !== null && 'type' in intent) {
      if (
        (intent.type === 'view-client' || intent.type === 'create-for-client')
        && 'clientId' in intent
        && typeof intent.clientId === 'string'
      ) {
        return { type: intent.type, clientId: intent.clientId }
      }
      if (
        intent.type === 'view-project'
        && 'projectId' in intent
        && typeof intent.projectId === 'string'
      ) {
        return { type: 'view-project', projectId: intent.projectId }
      }
    }
  } catch (error) {
    console.error('Unable to read project navigation request.', error)
  }
  return null
}

export function clearProjectNavigationIntent(): void {
  sessionStorage.removeItem(navigationIntentKey)
}
