import { api } from './client'
import type { OrdersAnalyticsRead } from './types'

export const analyticsApi = {
  async ordersProgress(startDate?: string, endDate?: string) {
    const { data } = await api.get<OrdersAnalyticsRead>('/analytics/orders-progress', {
      params: { start_date: startDate, end_date: endDate },
      skipErrorToast: true,
    })
    return data
  },
}
