import { useEffect, useId, type ReactNode } from 'react'
import { Button } from './Button'

type ModalProps = {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger'
  isConfirming?: boolean
  children?: ReactNode
}

export const Modal = ({
  isOpen,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  confirmVariant = 'primary',
  isConfirming = false,
  children,
}: ModalProps) => {
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div
        className="card"
        style={{ maxWidth: 420, margin: '15vh auto', animation: 'scaleIn 0.2s ease' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="h2" style={{ margin: 0 }}>{title}</h3>
        {description && <p className="body-text" style={{ margin: 0 }}>{description}</p>}
        {children}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          {/* Initial focus on the safe action, so Enter never confirms a destructive one by accident. */}
          <Button variant="ghost" onClick={onClose} disabled={isConfirming} autoFocus>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button variant={confirmVariant} onClick={onConfirm} isLoading={isConfirming}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
