import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'frontend.render_error',
        errorType: error.name,
      }),
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="projects-page">
          <section aria-labelledby="app-error-title" className="projects-state projects-empty-state" role="alert">
            <h1 id="app-error-title">No se pudo mostrar esta pantalla</h1>
            <p>Recarga la aplicación. Si el problema continúa, contacta a soporte.</p>
            <button
              className="project-primary-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              Recargar
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
