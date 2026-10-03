import type { ReactNode } from 'react'

type KPICardProps = {
  label: string
  value: ReactNode
  helper?: string
}

export const KPICard = ({ label, value, helper }: KPICardProps) => {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>{label}</span>
      <span className="h2" style={{ display: 'block', margin: 0 }}>{value}</span>
      {helper && <span className="caption" style={{ marginTop: '0.25rem', display: 'block' }}>{helper}</span>}
    </div>
  )
}
