import { api } from '../../shared/api/client'
import type {
  OrderCreate,
  OrderListParams,
  OrderRead,
  OrderStatusUpdate,
  OrderSummary,
  Page,
} from '../../shared/api/types'

export type CreateOrderResult = {
  order: OrderRead
  /** `true` when the API answered 200 + `Idempotent-Replayed` (the order already existed). */
  replayed: boolean
}

export const ordersApi = {
  /**
   * `Idempotency-Key` makes retries safe: the same key always yields the same order
   * (201 the first time, 200 + `Idempotent-Replayed: true` afterwards).
   */
  async create(payload: OrderCreate, idempotencyKey: string): Promise<CreateOrderResult> {
    const response = await api.post<OrderRead>('/orders', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    })
    const replayed = String(response.headers['idempotent-replayed'] ?? '').toLowerCase() === 'true'
    return { order: response.data, replayed }
  },
  /** Summaries: items included, tracking history omitted. */
  async list(params: OrderListParams = {}) {
    const { data } = await api.get<Page<OrderSummary>>('/orders', { params })
    return data
  },
  /** Full order, including `tracking_events`. The detail page renders its own error state. */
  async get(id: number) {
    const { data } = await api.get<OrderRead>(`/orders/${id}`, { skipErrorToast: true })
    return data
  },
  async updateStatus(id: number, payload: OrderStatusUpdate) {
    const { data } = await api.patch<OrderRead>(`/orders/${id}/status`, payload, { skipErrorToast: true })
    return data
  },
}
