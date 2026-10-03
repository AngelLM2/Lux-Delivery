import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getApiErrorMessage, getErrorBody, getErrorCode } from '../lib/errors'
import { toast } from '../stores/ui.store'

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The caller renders the error itself: skip the global toast. */
    skipErrorToast?: boolean
    /** Do not try to refresh the session on 401 (the request is part of the auth flow). */
    skipAuthRefresh?: boolean
    /** Internal: set when the request is being retried after a refresh. */
    _retried?: boolean
  }
}

/**
 * Same-origin client: the session lives in HttpOnly cookies (`lux_access`, `lux_refresh`),
 * so the app never touches tokens. `withCredentials` keeps that true when the API is on
 * another origin in development.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
})

/** Endpoints that must never trigger a refresh (they *are* the auth flow). */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']

const isNoRefreshPath = (url?: string) => {
  if (!url) return false
  const path = url.split('?')[0]
  return NO_REFRESH_PATHS.some((candidate) => path.endsWith(candidate))
}

let sessionExpiredHandler: () => void = () => {}

/** Registered by the auth store; called once the session cannot be recovered. */
export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler
}

let refreshInFlight: Promise<void> | null = null

/**
 * Single-flight refresh: N requests failing with 401 at the same time (or the SSE reconnect
 * racing an API call) share one `POST /auth/refresh`, so the refresh token rotates once.
 */
export const refreshSession = (): Promise<void> => {
  refreshInFlight ??= api
    .post('/auth/refresh', undefined, { skipAuthRefresh: true, skipErrorToast: true })
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

const shouldToast = (error: AxiosError) => {
  if (error.config?.skipErrorToast || error.code === 'ERR_CANCELED') return false
  // 422 with a per-field `detail` array is rendered next to the inputs by the form itself.
  if (error.response?.status === 422 && Array.isArray(getErrorBody(error)?.detail)) return false
  return true
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config: InternalAxiosRequestConfig | undefined = error.config
    const status = error.response?.status

    if (status === 401 && config && !config.skipAuthRefresh && !isNoRefreshPath(config.url)) {
      if (config._retried) {
        // Still unauthorized right after a successful refresh: the session is gone.
        sessionExpiredHandler()
        return Promise.reject(error)
      }
      config._retried = true
      try {
        await refreshSession()
      } catch (refreshError) {
        // Another tab rotated the refresh token first: the browser already holds the new
        // cookies, so the original request can simply be replayed once.
        if (getErrorCode(refreshError) !== 'refresh_token_rotated') {
          sessionExpiredHandler()
          return Promise.reject(error)
        }
      }
      return api(config)
    }

    if (shouldToast(error)) {
      toast.error(getApiErrorMessage(error), status && status >= 500 ? 8000 : undefined)
    }
    return Promise.reject(error)
  },
)
