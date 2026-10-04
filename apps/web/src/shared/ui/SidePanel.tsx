import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

type SidePanelProps = {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

/** Right-hand panel for create/edit forms, so long forms don't push the list off screen. */
export const SidePanel = ({ isOpen, title, description, onClose, children }: SidePanelProps) => {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  // Callers pass inline handlers: reading the latest one from a ref keeps the effect (and the
  // initial focus) tied to opening the panel, not to every re-render while the user types.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className="side-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="side-panel-header">
          <div>
            <h2 id={titleId} className="h2" style={{ margin: 0 }}>{title}</h2>
            {description && <p className="caption" style={{ margin: '0.35rem 0 0' }}>{description}</p>}
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Fechar painel">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="side-panel-body">{children}</div>
      </aside>
    </>
  )
}
