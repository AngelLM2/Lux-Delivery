import type { OrderSummary } from '../../../shared/api/types'
import { formatCurrency, formatDateTime, formatStatusLabel } from '../../../shared/lib/formatters'
import { Button } from '../../../shared/ui/Button'
import { ORDER_FLOW, summarizeItems } from '../status'
import { StatusPill } from './StatusPill'

type OrderCardProps = {
  order: OrderSummary
  onView?: () => void
  onCancel?: () => void
  canCancel?: boolean
  isCanceling?: boolean
}

export const OrderCard = ({ order, onView, onCancel, canCancel, isCanceling }: OrderCardProps) => {
  const currentStep = ORDER_FLOW.indexOf(order.status)
  const isCanceled = order.status === 'canceled'

  return (
    <article className="card" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h3 className="h3" style={{ margin: 0 }}>Pedido #{order.id}</h3>
        <StatusPill status={order.status} />
      </div>

      <p className="caption" style={{ margin: 0 }}>Realizado em {formatDateTime(order.created_at)}</p>

      {order.items.length > 0 && (
        <p className="body-text" style={{ margin: 0, color: 'var(--color-ink)' }}>{summarizeItems(order)}</p>
      )}

      <p className="body-text" style={{ margin: 0 }}>{order.delivery_address}</p>

      {!isCanceled && (
        <ol className="status-flow" aria-label={`Etapa atual: ${formatStatusLabel(order.status)}`}>
          {ORDER_FLOW.map((status, index) => (
            <li
              key={status}
              className={`status-dot ${index <= currentStep ? 'done' : ''}`}
              title={formatStatusLabel(status)}
            >
              <span />
            </li>
          ))}
        </ol>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <span className="price-text">{formatCurrency(order.total_amount)}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onView && (
            <Button variant="outline" size="sm" onClick={onView}>
              Ver detalhes
            </Button>
          )}
          {canCancel && onCancel && (
            <Button variant="danger" size="sm" onClick={onCancel} isLoading={isCanceling}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
