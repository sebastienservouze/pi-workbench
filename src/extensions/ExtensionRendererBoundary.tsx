import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Isole un renderer de fork afin qu’une erreur conserve le rendu officiel disponible. */
export class ExtensionRendererBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: (cause: unknown) => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(cause: Error, _info: ErrorInfo): void {
    this.props.onError(cause)
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
