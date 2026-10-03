import type { ReactNode } from 'react'
import { Component } from 'react'
import { Button } from '../ui/Button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }>{
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container page" style={{ textAlign: 'center' }}>
          <h1 className="h1">Something went wrong</h1>
          <p className="body-text" style={{ color: 'var(--color-text-muted)' }}>
            Please reload the page or try again in a moment.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
