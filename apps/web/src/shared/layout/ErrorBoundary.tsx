import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../ui/Button'

type ErrorBoundaryProps = {
  children: ReactNode
  /** When this value changes (e.g. the route), a previous error is cleared. */
  resetKey?: unknown
}

type ErrorBoundaryState = { hasError: boolean; resetKey: unknown }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    // Navigating away from a broken page should render the new page normally.
    if (props.resetKey !== state.resetKey) return { hasError: false, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container page" style={{ textAlign: 'center' }} role="alert">
          <h1 className="h1">Algo deu errado</h1>
          <p className="body-text" style={{ color: 'var(--color-muted)' }}>
            Recarregue a página ou tente novamente em instantes.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
