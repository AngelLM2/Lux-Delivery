import type { ReactNode } from 'react'

type AlertTone = 'info' | 'warning' | 'danger' | 'success'

type AlertProps = {
  tone?: AlertTone
  children: ReactNode
}

const BORDER: Record<AlertTone, string> = {
  info: 'var(--color-line)',
  success: 'rgba(52, 211, 153, 0.4)',
  danger: 'rgba(248, 113, 113, 0.4)',
  warning: 'rgba(251, 191, 36, 0.4)',
}

export const Alert = ({ tone = 'info', children }: AlertProps) => {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className="card" style={{ borderColor: BORDER[tone] }}>
      <p className="body-text" style={{ margin: 0 }}>{children}</p>
    </div>
  )
}
