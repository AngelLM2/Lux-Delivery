import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../features/auth/store'
import { refreshSession } from '../shared/api/client'
import { useUiStore } from '../shared/stores/ui.store'
import { makeUser } from '../test/fixtures'
import { RealtimeProvider, useRealtimeStatus } from './realtime'

vi.mock('../shared/api/client', () => ({
  API_BASE_URL: '/api/v1',
  api: {},
  refreshSession: vi.fn(() => Promise.resolve()),
  setSessionExpiredHandler: vi.fn(),
}))

type Listener = (event: MessageEvent<string>) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  readonly withCredentials: boolean
  closed = false
  onerror: ((event: Event) => void) | null = null
  private listeners = new Map<string, Set<Listener>>()

  constructor(url: string, init?: EventSourceInit) {
    this.url = url
    this.withCredentials = Boolean(init?.withCredentials)
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(listener)
  }

  close() {
    this.closed = true
  }

  /** Simulates the server sending `event: <type>\ndata: <json>`. */
  emit(type: string, data: unknown) {
    act(() => {
      this.listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data: JSON.stringify(data) })))
    })
  }

  fail() {
    act(() => this.onerror?.(new Event('error')))
  }
}

const latest = () => MockEventSource.instances[MockEventSource.instances.length - 1]

const StatusProbe = () => <span data-testid="status">{useRealtimeStatus()}</span>

const renderProvider = () => {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <StatusProbe />
      </RealtimeProvider>
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    useUiStore.setState({ toasts: [] })
    useAuthStore.setState({ status: 'authenticated', user: makeUser() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not open a stream for anonymous visitors', () => {
    useAuthStore.setState({ status: 'anonymous', user: null })
    renderProvider()
    expect(MockEventSource.instances).toHaveLength(0)
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })

  it('connects with cookies and reports "open" once the server says ready', () => {
    renderProvider()
    expect(latest().url).toBe('/api/v1/events/stream')
    expect(latest().withCredentials).toBe(true)
    expect(screen.getByTestId('status')).toHaveTextContent('connecting')

    latest().emit('ready', { channels: 1 })
    expect(screen.getByTestId('status')).toHaveTextContent('open')
  })

  it('invalidates order lists and the order detail on order.updated (once per event id)', () => {
    const { invalidate } = renderProvider()
    const event = { event_id: '1-0', order_id: 42, status: 'preparing', previous_status: 'confirmed' }

    latest().emit('order.updated', event)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders', 'list'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders', 'detail', 42] })

    invalidate.mockClear()
    latest().emit('order.updated', event) // duplicate delivery (e.g. admin on two channels)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refreshes notifications and shows a toast on notification.created', () => {
    const { invalidate } = renderProvider()
    latest().emit('notification.created', {
      id: 7,
      user_id: 1,
      order_id: 42,
      event_type: 'order.status_changed',
      message: 'Seu pedido #42 saiu para entrega.',
      is_read: false,
      created_at: '2026-10-03T12:00:00Z',
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toContain('Seu pedido #42 saiu para entrega.')
  })

  it('announces new orders to admins and refreshes the board and analytics', () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser({ role: 'admin' }) })
    const { invalidate } = renderProvider()

    latest().emit('order.created', { event_id: '9-0', order_id: 99, status: 'created', previous_status: null, total_amount: '120.00' })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders', 'list'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['analytics'] })
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toContain('Novo pedido #99')
  })

  it('summarises a burst of new orders instead of one toast per order', () => {
    vi.useFakeTimers()
    useAuthStore.setState({ status: 'authenticated', user: makeUser({ role: 'admin' }) })
    renderProvider()
    for (const id of [1, 2, 3, 4]) {
      latest().emit('order.created', { event_id: `${id}-0`, order_id: id, status: 'created', previous_status: null, total_amount: '10.00' })
    }
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toEqual(['Novo pedido #1'])
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toEqual(['Novo pedido #1', 'Mais 3 novos pedidos'])
  })

  it('on error: closes, refreshes the session and reconnects with backoff, then resyncs', async () => {
    vi.useFakeTimers()
    const { invalidate } = renderProvider()
    const first = latest()
    first.emit('ready', { channels: 1 })

    first.fail()
    expect(first.closed).toBe(true)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('reconnecting')
    expect(MockEventSource.instances).toHaveLength(1)

    // First retry happens after ~1s (+-20% jitter).
    await act(() => vi.advanceTimersByTimeAsync(1_300))
    expect(MockEventSource.instances).toHaveLength(2)

    invalidate.mockClear()
    latest().emit('ready', { channels: 1 })
    expect(screen.getByTestId('status')).toHaveTextContent('open')
    // Events may have been missed while offline.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })

  it('closes the stream when the user logs out', () => {
    renderProvider()
    const source = latest()
    act(() => useAuthStore.setState({ status: 'anonymous', user: null }))
    expect(source.closed).toBe(true)
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })
})
