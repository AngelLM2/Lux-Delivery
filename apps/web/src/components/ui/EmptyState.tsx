import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
      <svg
        width="80"
        height="60"
        viewBox="0 0 80 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ margin: '0 auto 1rem' }}
      >
        <rect
          x="10"
          y="15"
          width="60"
          height="35"
          rx="4"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1"
          fill="rgba(255, 255, 255, 0.03)"
        />
        <line x1="20" y1="28" x2="60" y2="28" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
        <line x1="20" y1="36" x2="50" y2="36" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
        <circle cx="40" cy="8" r="4" fill="rgba(255, 255, 255, 0.2)" />
      </svg>
      <h3 className="h3" style={{ marginBottom: '0.5rem' }}>{title}</h3>
      <p className="body-text">{description}</p>
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  )
}
