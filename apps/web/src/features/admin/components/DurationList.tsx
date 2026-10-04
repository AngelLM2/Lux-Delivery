import type { OrdersAnalytics } from '../../../shared/api/types'
import { formatMinutes } from '../../../shared/lib/formatters'

const STAGES = [
  { key: 'minutes_to_confirm', label: 'Confirmação' },
  { key: 'minutes_to_dispatch', label: 'Saída para entrega' },
  { key: 'minutes_to_deliver', label: 'Entrega' },
  { key: 'minutes_end_to_end', label: 'Total' },
] as const

/** Median time per stage of the order flow, with p90 as the "slow day" reference. */
export const DurationList = ({ analytics }: { analytics: OrdersAnalytics }) => (
  <ul className="admin-mini-list">
    {STAGES.map(({ key, label }) => {
      const stats = analytics[key]
      return (
        <li key={key} title={`Média ${formatMinutes(stats.avg)} · p50 ${formatMinutes(stats.p50)} · p90 ${formatMinutes(stats.p90)}`}>
          <span className="admin-mini-label">{label}</span>
          <span className="admin-mini-value">
            {formatMinutes(stats.p50)}
            <span className="caption">p90 {formatMinutes(stats.p90)}</span>
          </span>
        </li>
      )
    })}
  </ul>
)
