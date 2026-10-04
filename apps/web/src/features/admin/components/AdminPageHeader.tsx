import type { ReactNode } from 'react'

type AdminPageHeaderProps = {
  title: string
  /** Short context next to the title, e.g. "25 produtos". */
  meta?: ReactNode
  actions?: ReactNode
}

export const AdminPageHeader = ({ title, meta, actions }: AdminPageHeaderProps) => (
  <header className="admin-header">
    <div className="admin-header-title">
      <h1 className="admin-title">{title}</h1>
      {meta && <span className="admin-header-meta">{meta}</span>}
    </div>
    {actions && <div className="admin-header-actions">{actions}</div>}
  </header>
)
