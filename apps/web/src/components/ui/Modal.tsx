import type { ReactNode } from 'react'
import { Button } from './Button'

type ModalProps = {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  children?: ReactNode
}

export const Modal = ({
  isOpen,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  children,
}: ModalProps) => {
  if (!isOpen) return null

  return (
    <div className="drawer-overlay" role="dialog" aria-modal onClick={onClose}>
      <div
        className="card"
        style={{
          maxWidth: 420,
          margin: '15vh auto',
          animation: 'scaleIn 0.2s ease',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="h2" style={{ margin: 0 }}>{title}</h3>
        {description && (
          <p className="body-text" style={{ margin: 0 }}>{description}</p>
        )}
        {children}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {onConfirm && (
            <Button variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
