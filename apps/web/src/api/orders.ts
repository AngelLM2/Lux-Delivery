import { api } from './client'
import type { OrderCreate, OrderRead, OrderStatusUpdate, TrackingEventRead } from './types'

export const ordersApi = {
  async create(payload: OrderCreate) {
    const { data } = await api.post<OrderRead>('/orders/', payload)
    return data
  },
  async list() {
    const { data } = await api.get<OrderRead[]>('/orders/')
    return data
  },
  async get(id: number) {
    const { data } = await api.get<OrderRead>(`/orders/${id}`)
    return data
  },
  async updateStatus(id: number, payload: OrderStatusUpdate) {
    const { data } = await api.patch<OrderRead>(`/orders/${id}/status`, payload)
    return data
  },
  async tracking(id: number) {
    const { data } = await api.get<TrackingEventRead[]>(`/orders/${id}/tracking`)
    return data
  },
}
