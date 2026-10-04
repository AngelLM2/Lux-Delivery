import type { OrderStatus } from '../../../shared/api/types'
import { formatStatusLabel } from '../../../shared/lib/formatters'
import { ORDER_FLOW } from '../status'

/** Short names, so the five steps fit side by side on a phone. */
const STEP_LABELS: Record<OrderStatus, string> = {
  created: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Preparo',
  out_for_delivery: 'A caminho',
  delivered: 'Entregue',
  canceled: 'Cancelado',
}

/** Where the order is in its flow, step by step (not used for canceled orders). */
export const OrderProgress = ({ status }: { status: OrderStatus }) => {
  const current = ORDER_FLOW.indexOf(status)
  return (
    <ol className="order-progress" aria-label={`Etapa atual: ${formatStatusLabel(status)}`}>
      {ORDER_FLOW.map((step, index) => (
        <li
          key={step}
          className={index < current ? 'is-done' : index === current ? 'is-current' : undefined}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="order-progress-dot" aria-hidden="true" />
          <span className="order-progress-label">{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  )
}
