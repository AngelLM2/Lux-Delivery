import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { OrderStatus, OrderSummary } from '../../../shared/api/types'
import { formatCurrency, formatDayMonth, formatStatusLabel, formatTime } from '../../../shared/lib/formatters'
import { summarizeItems } from '../status'

const statusTone = (status: OrderStatus) =>
  status === 'delivered' ? 'is-on' : status === 'canceled' ? 'is-danger' : 'is-info'

/** A past order: one line, the whole row opens the order. */
export const OrderRow = ({ order }: { order: OrderSummary }) => (
  <li>
    <Link to={`/orders/${order.id}`} className="order-row" aria-label={`Pedido #${order.id}, ${formatStatusLabel(order.status)}`}>
      <span className="order-row-date">
        <strong>{formatDayMonth(order.created_at)}</strong>
        <span>{formatTime(order.created_at)}</span>
      </span>
      <span className="order-row-main">
        <span className="order-row-items">{summarizeItems(order)}</span>
        <span className="caption">Pedido #{order.id}</span>
      </span>
      <span className="price-text order-row-total">{formatCurrency(order.total_amount)}</span>
      <span className={`availability ${statusTone(order.status)} order-row-status`}>{formatStatusLabel(order.status)}</span>
      <ChevronRight size={18} className="order-row-chevron" aria-hidden="true" />
    </Link>
  </li>
)
