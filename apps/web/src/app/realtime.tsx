import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { analyticsKeys } from '../features/admin/hooks'
import { useAuthStore } from '../features/auth/store'
import { notificationKeys } from '../features/notifications/hooks'
import { orderKeys } from '../features/orders/hooks'
import { API_BASE_URL, refreshSession } from '../shared/api/client'
import type { RealtimeEventMap } from '../shared/api/types'
import { computeBackoff } from '../shared/lib/backoff'
import { getErrorCode, getErrorStatus } from '../shared/lib/errors'
import { toast } from '../shared/stores/ui.store'
import type { LiveStatus } from '../shared/ui/LiveIndicator'

export type RealtimeStatus = LiveStatus

const STREAM_URL = `${API_BASE_URL}/events/stream`
const MAX_REMEMBERED_EVENTS = 200

type HandledEvent = Exclude<keyof RealtimeEventMap, 'ready'>
type Handlers = { [K in HandledEvent]: (data: RealtimeEventMap[K]) => void }

const NEW_ORDER_TOAST_WINDOW_MS = 3000

/** What each server event means for the cache (and, sometimes, for the user). */
const createHandlers = (queryClient: QueryClient, isAdmin: boolean): Handlers => {
  // A busy lunch hour can bring several orders per second: the first one in a window gets its
  // own toast, the rest are summarised in a single "+N" toast instead of flooding the screen.
  let burst: { extra: number; timer?: ReturnType<typeof setTimeout> } = { extra: 0 }
  const announceNewOrder = (orderId: number) => {
    if (burst.timer !== undefined) {
      burst.extra += 1
      return
    }
    toast.info(`Novo pedido #${orderId}`)
    burst.timer = setTimeout(() => {
      if (burst.extra > 0) toast.info(burst.extra === 1 ? 'Mais 1 novo pedido' : `Mais ${burst.extra} novos pedidos`)
      burst = { extra: 0 }
    }, NEW_ORDER_TOAST_WINDOW_MS)
  }

  return {
    'order.updated': ({ order_id }) => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: orderKeys.detail(order_id) })
      // Analytics is a heavy aggregate: mark it stale (refetched on next visit / "Atualizar")
      // instead of re-running it for every status change on a busy board.
      if (isAdmin) void queryClient.invalidateQueries({ queryKey: analyticsKeys.all, refetchType: 'none' })
    },
    // Only published on the admin channel.
    'order.created': ({ order_id }) => {
      if (!isAdmin) return
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.all })
      announceNewOrder(order_id)
    },
    'notification.created': (notification) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      toast.info(notification.message)
    },
  }
}

const HANDLED_EVENTS: readonly HandledEvent[] = ['order.updated', 'order.created', 'notification.created']

type ConnectionProps = {
  isAdmin: boolean
  onStatusChange: (status: RealtimeStatus) => void
}

/**
 * Owns one `EventSource` while authenticated. The server closes it when the access token expires,
 * so on error we refresh the session and reconnect with backoff + jitter (reset on `ready`).
 */
const RealtimeConnection = ({ isAdmin, onStatusChange }: ConnectionProps) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof EventSource === 'undefined') return

    const handlers = createHandlers(queryClient, isAdmin)
    const seen = new Set<string>()
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let hasBeenOpen = false
    let disposed = false

    // Admins can get the same event twice (own channel + admin channel): process it once.
    const isDuplicate = (type: HandledEvent, data: unknown) => {
      const record = data as { event_id?: string; id?: number }
      const id = record.event_id ?? record.id
      if (id === undefined) return false
      const key = `${type}:${id}`
      if (seen.has(key)) return true
      seen.add(key)
      if (seen.size > MAX_REMEMBERED_EVENTS) seen.delete(seen.values().next().value as string)
      return false
    }

    const dispatch = <K extends HandledEvent>(type: K, event: MessageEvent<string>) => {
      let data: RealtimeEventMap[K]
      try {
        data = JSON.parse(event.data) as RealtimeEventMap[K]
      } catch {
        return
      }
      if (isDuplicate(type, data)) return
      handlers[type](data)
    }

    const resync = () => {
      // Events published while we were disconnected are lost: refetch what they would touch.
      void queryClient.invalidateQueries({ queryKey: orderKeys.all })
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    }

    const scheduleReconnect = () => {
      onStatusChange('reconnecting')
      const delay = computeBackoff(attempt)
      attempt += 1
      const refreshed = refreshSession().catch((error: unknown) => {
        // A plain 401 means the refresh token itself is gone: the session is over.
        if (getErrorStatus(error) === 401 && getErrorCode(error) !== 'refresh_token_rotated') {
          useAuthStore.getState().expireSession()
        }
      })
      retryTimer = setTimeout(() => void refreshed.then(connect), delay)
    }

    const connect = () => {
      if (disposed) return
      const eventSource = new EventSource(STREAM_URL, { withCredentials: true })
      source = eventSource

      eventSource.addEventListener('ready', () => {
        attempt = 0
        if (hasBeenOpen) resync()
        hasBeenOpen = true
        onStatusChange('open')
      })
      HANDLED_EVENTS.forEach((type) => {
        eventSource.addEventListener(type, (event) => dispatch(type, event as MessageEvent<string>))
      })
      eventSource.onerror = () => {
        eventSource.close()
        if (source !== eventSource || disposed) return
        source = null
        scheduleReconnect()
      }
    }

    onStatusChange('connecting')
    connect()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      source?.close()
      onStatusChange('idle')
    }
  }, [queryClient, isAdmin, onStatusChange])

  return null
}

const RealtimeContext = createContext<RealtimeStatus>('idle')

export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const userId = useAuthStore((state) => (state.status === 'authenticated' ? state.user?.id : undefined))
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin')
  const authenticated = userId !== undefined

  return (
    <RealtimeContext.Provider value={authenticated ? status : 'idle'}>
      {authenticated && <RealtimeConnection key={userId} isAdmin={isAdmin} onStatusChange={setStatus} />}
      {children}
    </RealtimeContext.Provider>
  )
}

/** Connection state of the SSE stream: `idle` (logged out), `connecting`, `open`, `reconnecting`. */
// eslint-disable-next-line react-refresh/only-export-components -- context hook lives next to its provider
export const useRealtimeStatus = () => useContext(RealtimeContext)
