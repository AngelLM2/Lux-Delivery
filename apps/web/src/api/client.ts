import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { uiStore } from '../stores/ui.store'
import { getApiErrorMessage, getRetryAfterSeconds } from '../utils/errors'

const baseURL = import.meta.env.VITE_API_URL || '/api'

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean
    skipAuth?: boolean
    skipErrorToast?: boolean
  }
  export interface AxiosRequestConfig {
    skipAuth?: boolean
    skipErrorToast?: boolean
  }
}

export const api = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true, // Send HttpOnly cookies on every request
})

const notifySessionExpired = () => {
  sessionStorage.setItem('lux_pending_toast', 'Session expired')
}

let refreshPromise: Promise<void> | null = null

const refreshTokens = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', {}, { skipAuth: true })
      .then(() => {
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}


api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const original = error.config as InternalAxiosRequestConfig | undefined
    const skipErrorToast = !!original?.skipErrorToast

    if (status === 401 && original && !original._retry && !original.skipAuth) {
      original._retry = true
      try {
        await refreshTokens()
        return api(original)
      } catch (refreshError) {
        const publicPaths = ['/login', '/register', '/']
        const alreadyOnPublicPage = publicPaths.some((p) => window.location.pathname === p)
        if (!alreadyOnPublicPage) {
          notifySessionExpired()
          uiStore.getState().addToast({
            type: 'error',
            message: 'Session expired. Please sign in again.',
          })
          window.location.assign('/login')
        }
        return Promise.reject(refreshError)
      }
    }

    if (!skipErrorToast && status && status !== 422) {
      const retryAfter = getRetryAfterSeconds(error)
      const message = getApiErrorMessage(error)
      if (status === 429 && retryAfter) {
        uiStore.getState().addToast({
          type: 'error',
          message: `Too many attempts. Please wait ${retryAfter} seconds.`,
        })
      } else if (status === 403) {
        uiStore.getState().addToast({ type: 'error', message: 'Not allowed.' })
      } else if (status === 404) {
        uiStore.getState().addToast({ type: 'error', message: 'Not found.' })
      } else if (status === 500) {
        uiStore.getState().addToast({ type: 'error', message: 'Internal error. Try again.' })
      } else if (status === 400) {
        uiStore.getState().addToast({ type: 'error', message })
      } else {
        uiStore.getState().addToast({ type: 'error', message })
      }
    }

    return Promise.reject(error)
  },
)
