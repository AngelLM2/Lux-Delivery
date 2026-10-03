import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../stores/ui.store'
import { api, setSessionExpiredHandler } from './client'

type Reply = { status: number; data?: unknown; delayMs?: number }
type Router = (config: InternalAxiosRequestConfig) => Reply

let route: Router = () => ({ status: 200 })

/** Fake transport: answers from `route` and rejects non-2xx like axios' own adapters. */
const adapter = vi.fn(async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const { status, data = null, delayMs = 0 } = route(config)
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
  const response: AxiosResponse = { status, statusText: String(status), data, headers: new AxiosHeaders(), config }
  if (status >= 200 && status < 300) return response
  throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response)
})

const calls = () => adapter.mock.calls.map(([config]) => `${config.method?.toUpperCase()} ${config.url}`)

/** Every non-refresh URL fails with 401 on its first call and succeeds afterwards. */
const expireOnce = (refresh: Reply): Router => {
  const seen = new Map<string, number>()
  return (config) => {
    if (config.url === '/auth/refresh') return refresh
    const count = (seen.get(config.url ?? '') ?? 0) + 1
    seen.set(config.url ?? '', count)
    return count === 1 ? { status: 401, data: { detail: 'Token expirado.', code: 'token_expired' } } : { status: 200, data: 'ok' }
  }
}

const originalAdapter = api.defaults.adapter
const sessionExpired = vi.fn()

describe('api client interceptors', () => {
  beforeEach(() => {
    api.defaults.adapter = adapter
    adapter.mockClear()
    sessionExpired.mockClear()
    setSessionExpiredHandler(sessionExpired)
    useUiStore.setState({ toasts: [] })
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
  })

  it('refreshes the session on 401 and replays the original request', async () => {
    route = expireOnce({ status: 200, data: { user: {}, access_expires_at: '' } })

    await expect(api.get('/orders')).resolves.toMatchObject({ status: 200 })
    expect(calls()).toEqual(['GET /orders', 'POST /auth/refresh', 'GET /orders'])
  })

  it('shares one refresh between concurrent 401s (single flight)', async () => {
    route = expireOnce({ status: 200, delayMs: 20 })

    await Promise.all([api.get('/orders'), api.get('/notifications/unread-count'), api.get('/auth/me')])
    expect(calls().filter((call) => call === 'POST /auth/refresh')).toHaveLength(1)
  })

  it('replays once when another tab already rotated the refresh token', async () => {
    route = expireOnce({ status: 401, data: { detail: 'Refresh token ja rotacionado.', code: 'refresh_token_rotated' } })

    await expect(api.get('/orders')).resolves.toMatchObject({ status: 200 })
    expect(calls()).toEqual(['GET /orders', 'POST /auth/refresh', 'GET /orders'])
    expect(sessionExpired).not.toHaveBeenCalled()
  })

  it('ends the session when the refresh itself is rejected', async () => {
    route = expireOnce({ status: 401, data: { detail: 'Refresh token ausente.', code: 'missing_refresh_token' } })

    await expect(api.get('/orders')).rejects.toMatchObject({ response: { status: 401 } })
    expect(sessionExpired).toHaveBeenCalledTimes(1)
    expect(calls()).toEqual(['GET /orders', 'POST /auth/refresh'])
  })

  it('never tries to refresh for the auth endpoints themselves', async () => {
    route = () => ({ status: 401, data: { detail: 'Credenciais invalidas.', code: 'invalid_credentials' } })

    await expect(api.post('/auth/login', { email: 'a@b.co', password: 'x' }, { skipErrorToast: true })).rejects.toBeInstanceOf(
      AxiosError,
    )
    expect(calls()).toEqual(['POST /auth/login'])
    expect(sessionExpired).not.toHaveBeenCalled()
  })

  it('toasts server errors with a short request id', async () => {
    route = () => ({
      status: 500,
      data: { detail: 'Erro interno. Tente novamente.', code: 'internal_error', request_id: 'abc12345-6789' },
    })

    await expect(api.get('/products')).rejects.toBeInstanceOf(AxiosError)
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toEqual(['Erro interno (ref: abc12345)'])
  })
})
