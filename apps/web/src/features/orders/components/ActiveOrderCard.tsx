import { Link } from 'react-router-dom'
import type { OrderSummary } from '../../../shared/api/types'
import { formatCurrency, formatDateTime, formatRelativeDate, formatStatusLabel } from '../../../shared/lib/formatters'
import { Button } from '../../../shared/ui/Button'
import { summarizeItems } from '../status'
import { OrderProgress } from './OrderProgress'

type ActiveOrderCardProps = {
  order: OrderSummary
  canCancel: boolean
  isCanceling: boolean
  onCancel: () => void
}

/** An order still on its way: where it is now, and the way to follow it. */
export const ActiveOrderCard = ({ order, canCancel, isCanceling, onCancel }: ActiveOrderCardProps) => (
  <article className="active-order">
    <header className="active-order-head">
      <div>
        <p className="active-order-status">{formatStatusLabel(order.status)}</p>
        <h3 className="active-order-title">
          Pedido #{order.id}{' '}
          <time className="caption" dateTime={order.created_at} title={formatDateTime(order.created_at)}>
            · {formatRelativeDate(order.created_at)}
          </time>
        </h3>
      </div>
      <span className="price-text">{formatCurrency(order.total_amount)}</span>
    </header>

    <OrderProgress status={order.status} />

    {order.items.length > 0 && <p className="active-order-items">{summarizeItems(order)}</p>}

    <footer className="active-order-actions">
      {canCancel && (
        <Button variant="ghost" size="sm" className="btn-ghost-danger" onClick={onCancel} isLoading={isCanceling}>
          Cancelar pedido
        </Button>
      )}
      <Link to={`/orders/${order.id}`} className="btn btn-primary btn-sm">
        Acompanhar
      </Link>
    </footer>
  </article>
)
