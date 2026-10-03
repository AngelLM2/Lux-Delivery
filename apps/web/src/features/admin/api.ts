import { api } from '../../shared/api/client'
import type {
  AdminUserCreate,
  OrdersAnalytics,
  OrdersAnalyticsParams,
  Page,
  UserListParams,
  UserRead,
} from '../../shared/api/types'

export const analyticsApi = {
  async orders(params: OrdersAnalyticsParams) {
    const { data } = await api.get<OrdersAnalytics>('/analytics/orders', { params, skipErrorToast: true })
    return data
  },
}

export const usersApi = {
  async list(params: UserListParams = {}) {
    const { data } = await api.get<Page<UserRead>>('/users', { params })
    return data
  },
  async create(payload: AdminUserCreate) {
    const { data } = await api.post<UserRead>('/users', payload, { skipErrorToast: true })
    return data
  },
  async activate(id: number) {
    const { data } = await api.patch<UserRead>(`/users/${id}/activate`)
    return data
  },
  async deactivate(id: number) {
    const { data } = await api.patch<UserRead>(`/users/${id}/deactivate`)
    return data
  },
}
