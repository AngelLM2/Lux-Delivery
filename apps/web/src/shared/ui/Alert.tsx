import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

type AlertTone = 'info' | 'warning' | 'danger' | 'success'

type AlertProps = {
  tone?: AlertTone
  children: ReactNode
}

const ICONS = { info: Info, success: CheckCircle2, danger: XCircle, warning: AlertTriangle }

export const Alert = ({ tone = 'info', children }: AlertProps) => {
  const Icon = ICONS[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`alert ${tone}`}>
      <span className="alert-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  )
}
