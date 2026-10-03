import { api } from './client'
import type { NotificationRead } from './types'

export const notificationsApi = {
  async list(onlyUnread?: boolean) {
    const { data } = await api.get<NotificationRead[]>('/notifications/', {
      params: { only_unread: onlyUnread },
    })
    return data
  },
  async markRead(id: number) {
    const { data } = await api.patch<NotificationRead>(`/notifications/${id}/read`)
    return data
  },
}
