import type { StatusCount } from '../../../shared/api/types'
import { formatNumber, formatPercent, formatStatusLabel } from '../../../shared/lib/formatters'
import { ORDER_STATUSES } from '../../orders/status'

type StatusChartProps = {
  data: StatusCount[]
}

/** Orders per status as horizontal bars, in the order of the flow (absent statuses show 0). */
export const StatusChart = ({ data }: StatusChartProps) => {
  const counts = new Map(data.map((item) => [item.status, item.count]))
  const rows = [
    ...ORDER_STATUSES.map((status) => ({ status: status as string, count: counts.get(status) ?? 0 })),
    // Defensive: a status the frontend does not know yet still shows up.
    ...data.filter((item) => !(ORDER_STATUSES as readonly string[]).includes(item.status)),
  ]
  const total = rows.reduce((sum, item) => sum + item.count, 0)
  const max = Math.max(...rows.map((item) => item.count), 1)

  return (
    <ul className="status-bars" aria-label={`Distribuição de ${formatNumber(total)} pedidos por status`}>
      {rows.map((item) => (
        <li
          key={item.status}
          className="status-bars-row"
          title={total > 0 ? `${formatPercent(item.count / total)} dos pedidos` : undefined}
        >
          <span className="status-bars-label">{formatStatusLabel(item.status)}</span>
          <span className="status-bars-track" aria-hidden="true">
            <span className={`status-bars-fill ${item.status}`} style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="status-bars-value">{formatNumber(item.count)}</span>
        </li>
      ))}
    </ul>
  )
}
