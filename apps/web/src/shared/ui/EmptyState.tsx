import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}

export const EmptyState = ({ title, description, action, icon }: EmptyStateProps) => {
  return (
    <div className="card empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon ?? <Inbox size={26} strokeWidth={1.5} />}
      </span>
      <div>
        <h3 className="h2" style={{ margin: '0 0 0.35rem' }}>{title}</h3>
        <p className="body-text" style={{ margin: 0 }}>{description}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
