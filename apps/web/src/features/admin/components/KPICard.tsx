import type { ReactNode } from 'react'

type KPICardProps = {
  label: string
  value: ReactNode
  helper?: ReactNode
}

export const KPICard = ({ label, value, helper }: KPICardProps) => (
  <div className="card kpi-card" style={{ padding: '1rem', gap: '0.25rem' }}>
    <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>{label}</span>
    <span className="h2" style={{ display: 'block', margin: 0 }}>{value}</span>
    {helper && <span className="caption" style={{ display: 'block' }}>{helper}</span>}
  </div>
)
