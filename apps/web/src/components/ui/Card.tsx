import type { ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  actions?: ReactNode
}

export const Card = ({ children, className = '', title, subtitle, actions }: CardProps) => {
  return (
    <div className={`card ${className}`}>
      {title || actions ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            {title ? <h3 className="h3" style={{ margin: 0 }}>{title}</h3> : null}
            {subtitle ? (
              <p className="caption" style={{ marginTop: '0.3rem' }}>{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}
