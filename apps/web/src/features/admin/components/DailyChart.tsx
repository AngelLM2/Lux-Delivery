import { useEffect, useId, useRef, useState } from 'react'
import type { DailyPoint } from '../../../shared/api/types'
import { formatCompactCurrency, formatCurrency, formatNumber, formatShortDate } from '../../../shared/lib/formatters'

type DailyChartProps = {
  data: DailyPoint[]
  /** Fallback width before the container is measured (and in tests). */
  initialWidth?: number
}

const HEIGHT = 300
const MARGIN = { top: 12, right: 12, bottom: 28, left: 64 }
const PANEL_GAP = 28
const REVENUE_SHARE = 0.6
const MAX_BAR_WIDTH = 24
const MAX_X_LABELS = 8

/** Smallest "nice" number (1, 2, 2.5, 5 x 10^n) >= value, so ticks land on round values. */
const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10
  return step * magnitude
}

/** Rounded top, square at the baseline. */
const barPath = (x: number, y: number, width: number, height: number) => {
  if (height <= 0) return `M${x},${y}h${width}`
  const r = Math.min(4, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

const useContainerWidth = (initialWidth: number) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(initialWidth)

  // The wrapper is rendered in every state (empty included), so measuring once on mount is enough.
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * Revenue (bars) and orders (line) per day, as two panels sharing the day axis.
 * Each panel keeps its own single y-scale - no dual-axis chart. Dependency-free SVG,
 * sized to its container so the text stays legible on small screens.
 */
export const DailyChart = ({ data, initialWidth = 720 }: DailyChartProps) => {
  const titleId = useId()
  const descId = useId()
  const { ref, width } = useContainerWidth(initialWidth)
  const [hovered, setHovered] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <div className="daily-chart" ref={ref}>
        <p className="body-text">Sem pedidos no período selecionado.</p>
      </div>
    )
  }

  const innerWidth = Math.max(120, width - MARGIN.left - MARGIN.right)
  const panelsHeight = HEIGHT - MARGIN.top - MARGIN.bottom - PANEL_GAP
  const revenueHeight = panelsHeight * REVENUE_SHARE
  const ordersHeight = panelsHeight - revenueHeight
  const revenueTop = MARGIN.top
  const revenueBase = revenueTop + revenueHeight
  const ordersTop = revenueBase + PANEL_GAP
  const ordersBase = ordersTop + ordersHeight

  const maxRevenue = niceCeil(Math.max(...data.map((point) => point.revenue)))
  const maxOrders = niceCeil(Math.max(...data.map((point) => point.orders)))
  const band = innerWidth / data.length
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, band - 2))
  const xCenter = (index: number) => MARGIN.left + band * index + band / 2
  const revenueY = (value: number) => revenueBase - (value / maxRevenue) * revenueHeight
  const ordersY = (value: number) => ordersBase - (value / maxOrders) * ordersHeight
  const labelEvery = Math.ceil(data.length / MAX_X_LABELS)
  const showDots = data.length <= 31

  const linePath = data
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xCenter(index).toFixed(1)},${ordersY(point.orders).toFixed(1)}`)
    .join(' ')

  const totalRevenue = data.reduce((sum, point) => sum + point.revenue, 0)
  const totalOrders = data.reduce((sum, point) => sum + point.orders, 0)
  const best = data.reduce((top, point) => (point.revenue > top.revenue ? point : top), data[0])
  const active = hovered !== null ? data[hovered] : null

  return (
    <div className="daily-chart" ref={ref}>
      <p className="daily-chart-readout caption" aria-live="polite">
        {active
          ? `${formatShortDate(active.day)} · ${formatCurrency(active.revenue)} · ${formatNumber(active.orders)} pedidos · ${formatNumber(active.delivered)} entregues`
          : 'Passe o mouse sobre um dia para ver os detalhes.'}
      </p>

      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        onMouseLeave={() => setHovered(null)}
      >
        <title id={titleId}>Receita e pedidos por dia</title>
        <desc id={descId}>
          {`${data.length} dias, receita total de ${formatCurrency(totalRevenue)} em ${formatNumber(totalOrders)} pedidos. ` +
            `Maior receita em ${formatShortDate(best.day)}: ${formatCurrency(best.revenue)}.`}
        </desc>

        {/* Panel labels */}
        <text x={MARGIN.left} y={revenueTop - 2} className="daily-chart-panel-label">Receita</text>
        <text x={MARGIN.left} y={ordersTop - 6} className="daily-chart-panel-label">Pedidos</text>

        {/* Gridlines + y ticks (0, half, max) */}
        {[0, 0.5, 1].map((fraction) => (
          <g key={`revenue-${fraction}`}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + innerWidth}
              y1={revenueY(maxRevenue * fraction)}
              y2={revenueY(maxRevenue * fraction)}
              className="daily-chart-grid"
            />
            <text x={MARGIN.left - 8} y={revenueY(maxRevenue * fraction) + 4} textAnchor="end" className="daily-chart-tick">
              {formatCompactCurrency(maxRevenue * fraction)}
            </text>
          </g>
        ))}
        {[0, 1].map((fraction) => (
          <g key={`orders-${fraction}`}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + innerWidth}
              y1={ordersY(maxOrders * fraction)}
              y2={ordersY(maxOrders * fraction)}
              className="daily-chart-grid"
            />
            <text x={MARGIN.left - 8} y={ordersY(maxOrders * fraction) + 4} textAnchor="end" className="daily-chart-tick">
              {formatNumber(maxOrders * fraction)}
            </text>
          </g>
        ))}

        {/* Hover highlight */}
        {hovered !== null && (
          <rect
            x={MARGIN.left + band * hovered}
            y={revenueTop}
            width={band}
            height={ordersBase - revenueTop}
            className="daily-chart-hover"
          />
        )}

        {/* Revenue bars */}
        {data.map((point, index) => {
          const y = revenueY(point.revenue)
          return (
            <path
              key={point.day}
              className={`daily-chart-bar ${hovered === index ? 'is-active' : ''}`}
              d={barPath(xCenter(index) - barWidth / 2, y, barWidth, revenueBase - y)}
            />
          )
        })}

        {/* Orders line */}
        <path d={linePath} className="daily-chart-line" />
        {data.map((point, index) =>
          showDots || hovered === index ? (
            <circle
              key={point.day}
              cx={xCenter(index)}
              cy={ordersY(point.orders)}
              r={hovered === index ? 5 : 4}
              className="daily-chart-dot"
            />
          ) : null,
        )}

        {/* X labels */}
        {data.map((point, index) =>
          index % labelEvery === 0 ? (
            <text key={point.day} x={xCenter(index)} y={HEIGHT - 8} textAnchor="middle" className="daily-chart-tick">
              {formatShortDate(point.day)}
            </text>
          ) : null,
        )}

        {/* Hit targets: the whole column of a day, taller than any mark */}
        {data.map((point, index) => (
          <rect
            key={point.day}
            x={MARGIN.left + band * index}
            y={revenueTop}
            width={band}
            height={ordersBase - revenueTop}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
          >
            <title>{`${formatShortDate(point.day)}: ${formatCurrency(point.revenue)}, ${point.orders} pedidos`}</title>
          </rect>
        ))}
      </svg>

      <table className="sr-only">
        <caption>Receita e pedidos por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Pedidos</th>
            <th scope="col">Entregues</th>
            <th scope="col">Receita</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{formatShortDate(point.day)}</th>
              <td>{point.orders}</td>
              <td>{point.delivered}</td>
              <td>{formatCurrency(point.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
