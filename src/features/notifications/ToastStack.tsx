export interface Toast {
  id: string
  kind: 'notice' | 'error'
  message: string
  sessionId: string | null
}

/** Displays temporary notifications above the input area. */
export function ToastStack({ onDismiss, standalone = false, toasts }: {
  onDismiss: (id: string) => void
  standalone?: boolean
  toasts: Toast[]
}) {
  if (toasts.length === 0) return null

  return <div aria-label="Notifications" aria-live="polite" aria-relevant="additions removals" className={`toast-stack${standalone ? ' toast-stack-standalone' : ''}`}>
    {toasts.map((toast) => <ToastItem key={toast.id} onDismiss={onDismiss} toast={toast} />)}
  </div>
}

/** Presents a notification's content and dismiss action. */
function ToastItem({ onDismiss, toast }: { onDismiss: (id: string) => void; toast: Toast }) {
  return <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
    <span className="toast-message">{toast.message}</span>
    <button aria-label="Dismiss notification" className="toast-dismiss" onClick={() => onDismiss(toast.id)} type="button">×</button>
  </div>
}
