import type { OrdersAnalyticsRead } from '../../api/types'
import { formatStatusLabel } from '../../utils/formatters'

type StatusChartProps = {
  data: OrdersAnalyticsRead
}

export const StatusChart = ({ data }: StatusChartProps) => {
  const max = Math.max(...data.status_breakdown.map((item) => item.count), 1)

  return (
    <svg
      width="100%"
      height="180"
      viewBox="0 0 600 180"
      role="img"
      aria-label="Order status distribution"
    >
      {data.status_breakdown.map((item, index) => {
        const barHeight = (item.count / max) * 120
        const x = 40 + index * 90
        const y = 140 - barHeight
        return (
          <g key={item.status}>
            <rect
              x={x}
              y={y}
              width={50}
              height={barHeight}
              fill="url(#chartGradient)"
            />
            <text
              x={x + 25}
              y={160}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="10"
              fontFamily="DM Sans, sans-serif"
            >
              {formatStatusLabel(item.status as any)}
            </text>
            <text
              x={x + 25}
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
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.3)" />
        </linearGradient>
      </defs>
    </svg>
  )
}
