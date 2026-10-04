import { ChevronDown, X } from 'lucide-react'
import { useId, useState } from 'react'
import type { OrderStatus, OrderSummary } from '../../../shared/api/types'
import { formatCurrency, formatDateTime, formatRelativeDate } from '../../../shared/lib/formatters'
import { Button } from '../../../shared/ui/Button'
import { StatusPill } from '../../orders/components/StatusPill'
import { NEXT_STATUS_ACTION, getNextStatus, isFinalStatus, summarizeItems } from '../../orders/status'

/** One-word version of `NEXT_STATUS_ACTION`, so the button fits in a row (the full text is the tooltip). */
const NEXT_STEP_SHORT: Partial<Record<OrderStatus, string>> = {
  created: 'Confirmar',
  confirmed: 'Preparar',
  preparing: 'Despachar',
  out_for_delivery: 'Concluir',
}

type AdminOrderRowProps = {
  order: OrderSummary
  isPending: boolean
  onAdvance: () => void
  onCancel: () => void
}

/** One order per row; address, notes and the item list stay folded until the row is expanded. */
export const AdminOrderRow = ({ order, isPending, onAdvance, onCancel }: AdminOrderRowProps) => {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const next = getNextStatus(order.status)
  const nextLabel = NEXT_STATUS_ACTION[order.status]

  return (
    <li className={`admin-order-row ${open ? 'is-open' : ''}`} aria-busy={isPending || undefined}>
      <div className="admin-row admin-order-grid">
        <span className="admin-order-ref">
          <strong>#{order.id}</strong>
          <time className="caption" dateTime={order.created_at} title={formatDateTime(order.created_at)}>
            {formatRelativeDate(order.created_at)}
          </time>
        </span>
        <span className="admin-row-main">
          <span className="admin-order-summary">{summarizeItems(order, 3)}</span>
          <span className="caption">Cliente #{order.customer_id}</span>
        </span>
        <span className="price-text admin-row-price">{formatCurrency(order.total_amount)}</span>
        <span className="admin-order-status">
          <StatusPill status={order.status} />
        </span>
        <span className="admin-row-actions">
          {next && nextLabel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAdvance}
              isLoading={isPending}
              title={nextLabel}
              aria-label={`${nextLabel} (pedido #${order.id})`}
            >
              {NEXT_STEP_SHORT[order.status]}
            </Button>
          )}
          {!isFinalStatus(order.status) && (
            <button
              type="button"
              className="icon-action is-danger"
              onClick={onCancel}
              disabled={isPending}
              aria-label={`Cancelar pedido #${order.id}`}
              title="Cancelar pedido"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="icon-action admin-order-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? `Ocultar detalhes do pedido #${order.id}` : `Ver detalhes do pedido #${order.id}`}
          >
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        </span>
      </div>

      {open && (
        <div id={detailsId} className="admin-order-details">
          <ul className="admin-order-lines">
            {order.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.quantity}x {item.product_name}
                </span>
                <span className="caption">{formatCurrency(item.total_price)}</span>
              </li>
            ))}
          </ul>
          <dl className="admin-order-facts">
            <div>
              <dt>Entrega</dt>
              <dd>{order.delivery_address}</dd>
            </div>
            {order.notes && (
              <div>
                <dt>Observações</dt>
                <dd>{order.notes}</dd>
              </div>
            )}
            <div>
              <dt>Feito em</dt>
              <dd>{formatDateTime(order.created_at)}</dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  )
}
