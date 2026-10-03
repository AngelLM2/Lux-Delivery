import type { ReactNode } from 'react'

type AlertProps = {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
}

export const Alert = ({ tone = 'info', children }: AlertProps) => {
  return (
    <div
      role="alert"
      className="card"
      style={{
        borderColor:
          tone === 'success'
            ? 'rgba(46, 204, 113, 0.4)'
            : tone === 'danger'
              ? 'rgba(231, 76, 60, 0.4)'
              : tone === 'warning'
                ? 'rgba(240, 201, 107, 0.4)'
                : 'var(--border-subtle)',
      }}
    >
      <p className="body-text">{children}</p>
    </div>
  )
}
