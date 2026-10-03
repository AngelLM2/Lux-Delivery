import type { OrderRead, OrderStatus } from '../../api/types'
import { formatCurrency, formatDateTime } from '../../utils/formatters'
import { StatusPill } from './StatusPill'
import { Button } from '../ui/Button'

const FLOW: OrderStatus[] = [
  'created',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
]

type OrderCardProps = {
  order: OrderRead
  onView?: () => void
  onCancel?: () => void
  canCancel?: boolean
}

export const OrderCard = ({ order, onView, onCancel, canCancel }: OrderCardProps) => {
  return (
    <article className="card" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="h3" style={{ margin: 0 }}>Order #{order.id}</h3>
        <StatusPill status={order.status} />
      </div>

      <p className="caption" style={{ margin: 0 }}>
        Placed {formatDateTime(order.created_at)}
      </p>

      <p className="body-text" style={{ margin: 0 }}>{order.delivery_address}</p>

      <div className="status-flow">
        {FLOW.map((status, index) => {
          const completed = FLOW.indexOf(order.status) >= index
          return (
            <div key={status} className={`status-dot ${completed ? 'done' : ''}`}>
              <span />
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="price-text">{formatCurrency(order.total_amount)}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onView && (
            <Button variant="outline" size="sm" onClick={onView}>
              See details
            </Button>
          )}
          {canCancel && onCancel && (
            <Button variant="danger" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
