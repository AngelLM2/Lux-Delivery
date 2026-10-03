import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query'
import { PAGE_SIZE, cursorPagination, flattenPages, mapPages } from '../../shared/api/pagination'
import type { NotificationRead, Page, UnreadCount } from '../../shared/api/types'
import { toast } from '../../shared/stores/ui.store'
import { notificationsApi } from './api'

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (onlyUnread: boolean) => [...notificationKeys.lists(), { onlyUnread }] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

type NotificationPages = InfiniteData<Page<NotificationRead>>

export const useNotificationList = (onlyUnread: boolean) => {
  const query = useInfiniteQuery({
    queryKey: notificationKeys.list(onlyUnread),
    queryFn: ({ pageParam }) =>
      notificationsApi.list({ only_unread: onlyUnread || undefined, cursor: pageParam, limit: PAGE_SIZE }),
    ...cursorPagination,
  })
  return { ...query, notifications: flattenPages(query.data) }
}

/**
 * Navbar badge. Kept fresh by the SSE `notification.created` event; the 60s polling is
 * only a fallback for when the stream is down.
 */
export const useUnreadCount = (enabled: boolean) =>
  useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationsApi.unreadCount,
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    select: (data) => data.unread,
  })

type Snapshot = { lists: Array<[QueryKey, NotificationPages | undefined]>; unread: UnreadCount | undefined }

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    // Optimistic: the item turns "read" and the badge decrements before the server answers.
    onMutate: async (id): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })
      const snapshot: Snapshot = {
        lists: queryClient.getQueriesData<NotificationPages>({ queryKey: notificationKeys.lists() }),
        unread: queryClient.getQueryData<UnreadCount>(notificationKeys.unreadCount()),
      }
      queryClient.setQueriesData<NotificationPages>({ queryKey: notificationKeys.lists() }, (data) =>
        mapPages(data, (item) => (item.id === id ? { ...item, is_read: true } : item)),
      )
      queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), (current) =>
        current ? { unread: Math.max(0, current.unread - 1) } : current,
      )
      return snapshot
    },
    onError: (_error, _id, snapshot) => {
      snapshot?.lists.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (snapshot?.unread) queryClient.setQueryData(notificationKeys.unreadCount(), snapshot.unread)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: ({ updated }) => {
      queryClient.setQueriesData<NotificationPages>({ queryKey: notificationKeys.lists() }, (data) =>
        mapPages(data, (item) => (item.is_read ? item : { ...item, is_read: true })),
      )
      queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), { unread: 0 })
      toast.success(
        updated === 0
          ? 'Nenhuma notificação pendente.'
          : `${updated} ${updated === 1 ? 'notificação marcada' : 'notificações marcadas'} como lida${updated === 1 ? '' : 's'}.`,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
