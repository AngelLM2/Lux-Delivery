import type { OrderSummary } from '../../../shared/api/types'
import { formatCurrency, formatDateTime, formatRelativeDate } from '../../../shared/lib/formatters'
import { Button } from '../../../shared/ui/Button'
import { StatusPill } from '../../orders/components/StatusPill'
import { NEXT_STATUS_ACTION, getNextStatus, isFinalStatus, summarizeItems } from '../../orders/status'

type AdminOrderCardProps = {
  order: OrderSummary
  isPending: boolean
  onAdvance: () => void
  onCancel: () => void
}

/** One order on the admin board: one click moves it to the next step of the flow. */
export const AdminOrderCard = ({ order, isPending, onAdvance, onCancel }: AdminOrderCardProps) => {
  const next = getNextStatus(order.status)
  const final = isFinalStatus(order.status)

  return (
    <article className="card admin-order-card" aria-busy={isPending || undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
          <h3 className="h3" style={{ margin: 0 }}>Pedido #{order.id}</h3>
          <p className="caption" style={{ margin: 0 }}>
            Cliente #{order.customer_id} ·{' '}
            <time dateTime={order.created_at} title={formatDateTime(order.created_at)}>
              {formatRelativeDate(order.created_at)}
            </time>
          </p>
          <p className="caption" style={{ margin: 0 }}>{order.delivery_address}</p>
        </div>
        <div style={{ textAlign: 'right', display: 'grid', gap: '0.35rem', justifyItems: 'end' }}>
          <StatusPill status={order.status} />
          <span className="price-text">{formatCurrency(order.total_amount)}</span>
        </div>
      </div>

      {order.items.length > 0 && <p className="body-text" style={{ margin: 0 }}>{summarizeItems(order, 5)}</p>}
      {order.notes && (
        <p className="caption" style={{ margin: 0 }}>
          <strong>Obs.:</strong> {order.notes}
        </p>
      )}

      {!final && (
        <div className="admin-order-actions">
          {next && (
            <Button variant="primary" size="sm" onClick={onAdvance} isLoading={isPending}>
              {NEXT_STATUS_ACTION[order.status]}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      )}
    </article>
  )
}
