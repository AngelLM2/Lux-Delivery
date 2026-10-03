import { api } from '../../shared/api/client'
import type {
  MarkAllResult,
  NotificationListParams,
  NotificationRead,
  Page,
  UnreadCount,
} from '../../shared/api/types'

export const notificationsApi = {
  async list(params: NotificationListParams = {}) {
    const { data } = await api.get<Page<NotificationRead>>('/notifications', { params })
    return data
  },
  async unreadCount() {
    // Background polling: a transient failure should not pop a toast every minute.
    const { data } = await api.get<UnreadCount>('/notifications/unread-count', { skipErrorToast: true })
    return data
  },
  async markRead(id: number) {
    const { data } = await api.patch<NotificationRead>(`/notifications/${id}/read`)
    return data
  },
  async markAllRead() {
    const { data } = await api.post<MarkAllResult>('/notifications/read-all')
    return data
  },
}
