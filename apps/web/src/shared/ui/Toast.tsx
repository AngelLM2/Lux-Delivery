import { useEffect } from 'react'
import { useUiStore, type Toast } from '../stores/ui.store'

export const ToastContainer = () => {
  const toasts = useUiStore((state) => state.toasts)

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
    </div>
  )
}

const ToastItem = ({ id, type, message, duration = 4200 }: Toast) => {
  const removeToast = useUiStore((state) => state.removeToast)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, removeToast])

  return (
    <div
      className={`toast ${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      onClick={() => removeToast(id)}
      title="Fechar"
    >
      <div>{message}</div>
      <span className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  )
}
