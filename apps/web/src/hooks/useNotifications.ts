import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications'
import type { NotificationRead } from '../api/types'

export const useNotifications = (onlyUnread?: boolean, enabled = true) => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications', onlyUnread],
    queryFn: () => notificationsApi.list(onlyUnread),
    refetchInterval: 30000,
    enabled,
  })

  const mutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData<NotificationRead[]>([
        'notifications',
        onlyUnread,
      ])
      if (previous) {
        queryClient.setQueryData<NotificationRead[]>(['notifications', onlyUnread], (items) =>
          items
            ? items.map((item) =>
                item.id === id ? { ...item, is_read: true } : item,
              )
            : items,
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications', onlyUnread], context.previous)
      }
    },
    onSuccess: (notification) => {
      queryClient.setQueryData<NotificationRead[]>(['notifications', onlyUnread], (items) =>
        items ? items.map((item) => (item.id === notification.id ? notification : item)) : [notification],
      )
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    retry: 0,
  })

  return {
    notifications: (query.data ?? []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    query,
    markRead: mutation.mutateAsync,
  }
}
