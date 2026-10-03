import type { OrderStatus, OrderSummary } from '../../shared/api/types'
import { getApiErrorMessage, getErrorCode, getErrorStatus } from '../../shared/lib/errors'

/** Happy path of the order state machine (the API also allows `canceled` from any non-final state). */
export const ORDER_FLOW: readonly OrderStatus[] = ['created', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']

export const ORDER_STATUSES: readonly OrderStatus[] = [...ORDER_FLOW, 'canceled']

export const isFinalStatus = (status: OrderStatus) => status === 'delivered' || status === 'canceled'

/** `created -> confirmed -> preparing -> out_for_delivery -> delivered`; `null` at the end. */
export const getNextStatus = (status: OrderStatus): OrderStatus | null => {
  const index = ORDER_FLOW.indexOf(status)
  return index >= 0 && index < ORDER_FLOW.length - 1 ? ORDER_FLOW[index + 1] : null
}

/** Label of the button that moves an order to the next step. */
export const NEXT_STATUS_ACTION: Partial<Record<OrderStatus, string>> = {
  created: 'Confirmar pedido',
  confirmed: 'Iniciar preparo',
  preparing: 'Enviar para entrega',
  out_for_delivery: 'Marcar como entregue',
}

/** Customers may cancel only before the kitchen starts (same rule as the API). */
export const canCustomerCancel = (status: OrderStatus) => status === 'created' || status === 'confirmed'

/** Friendly message for `PATCH /orders/{id}/status` failures. */
export const describeStatusChangeError = (error: unknown) => {
  const code = getErrorCode(error)
  const status = getErrorStatus(error)
  if (status === 409 || code === 'invalid_transition') {
    return 'Este pedido já foi atualizado por outra pessoa. A lista foi recarregada.'
  }
  if (code === 'transition_not_allowed') {
    return getApiErrorMessage(error, 'Você não tem permissão para alterar este pedido.')
  }
  return getApiErrorMessage(error)
}

/** `2x Risoto, 1x Vinho e mais 2` (uses `product_name`, snapshotted by the API at order time). */
export const summarizeItems = (order: Pick<OrderSummary, 'items'>, max = 3) => {
  const parts = order.items.slice(0, max).map((item) => `${item.quantity}x ${item.product_name}`)
  const rest = order.items.length - max
  return rest > 0 ? `${parts.join(', ')} e mais ${rest}` : parts.join(', ')
}
