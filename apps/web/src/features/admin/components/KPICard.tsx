import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type KPICardProps = {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon: LucideIcon
}

export const KPICard = ({ label, value, helper, icon: Icon }: KPICardProps) => (
  <div className="kpi-card">
    <div className="kpi-card-top">
      <span className="kpi-label">{label}</span>
      <span className="kpi-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.75} />
      </span>
    </div>
    <span className="kpi-value">{value}</span>
    {helper && <span className="kpi-helper">{helper}</span>}
  </div>
)
