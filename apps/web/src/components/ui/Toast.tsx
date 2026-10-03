import { useEffect } from 'react'
import { useUiStore } from '../../stores/ui.store'

export const ToastContainer = () => {
  const toasts = useUiStore((state) => state.toasts)
  const removeToast = useUiStore((state) => state.removeToast)

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

type ToastItemProps = {
  id: string
  type: 'success' | 'error' | 'info' | 'loading'
  message: string
  duration?: number
  onClose: () => void
}

const ToastItem = ({ type, message, duration = 4200, onClose }: ToastItemProps) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`toast ${type}`} role="status">
      <div>{message}</div>
      <span className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  )
}
