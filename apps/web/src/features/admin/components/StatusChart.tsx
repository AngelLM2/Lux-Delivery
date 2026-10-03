import { useId } from 'react'
import type { StatusCount } from '../../../shared/api/types'
import { formatStatusLabel } from '../../../shared/lib/formatters'
import { ORDER_STATUSES } from '../../orders/status'

type StatusChartProps = {
  data: StatusCount[]
}

const WIDTH = 600
const HEIGHT = 180
const BASELINE = 140
const MAX_BAR_HEIGHT = 112

/** Orders per status, in the order of the flow (statuses absent from the period show 0). */
export const StatusChart = ({ data }: StatusChartProps) => {
  // React ids contain ':', which is not safe inside `url(#...)` references.
  const gradientId = `status-gradient-${useId().replace(/:/g, '')}`
  const counts = new Map(data.map((item) => [item.status, item.count]))
  const rows = [
    ...ORDER_STATUSES.map((status) => ({ status: status as string, count: counts.get(status) ?? 0 })),
    // Defensive: a status the frontend does not know yet still shows up.
    ...data.filter((item) => !(ORDER_STATUSES as readonly string[]).includes(item.status)),
  ]
  const max = Math.max(...rows.map((item) => item.count), 1)
  const slot = WIDTH / rows.length
  const barWidth = Math.min(50, slot * 0.6)
  const total = rows.reduce((sum, item) => sum + item.count, 0)

  return (
    <svg
      width="100%"
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Distribuição de ${total} pedidos por status: ${rows
        .map((item) => `${formatStatusLabel(item.status)} ${item.count}`)
        .join(', ')}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.3)" />
        </linearGradient>
      </defs>
      {rows.map((item, index) => {
        const barHeight = (item.count / max) * MAX_BAR_HEIGHT
        const x = slot * index + (slot - barWidth) / 2
        const y = BASELINE - barHeight
        return (
          <g key={item.status}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={`url(#${gradientId})`}>
              <title>{`${formatStatusLabel(item.status)}: ${item.count}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={160}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="10"
              fontFamily="DM Sans, sans-serif"
            >
              {formatStatusLabel(item.status)}
            </text>
            <text
              x={x + barWidth / 2}
              y={y - 6}
              textAnchor="middle"
              fill="#f3f4f6"
              fontSize="12"
              fontFamily="DM Sans, sans-serif"
            >
              {item.count}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
