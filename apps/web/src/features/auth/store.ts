import { create } from 'zustand'
import { setSessionExpiredHandler } from '../../shared/api/client'
import type { LoginRequest, UserCreate, UserRead } from '../../shared/api/types'
import { toast } from '../../shared/stores/ui.store'
import { authApi } from './api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/** How the last session ended: after an explicit logout the next login starts fresh. */
export type SessionEnd = 'logout' | 'expired' | null

type AuthState = {
  user: UserRead | null
  status: AuthStatus
  sessionEnd: SessionEnd
  /** Restores the session from the cookies (once per page load). */
  boot: () => Promise<void>
  login: (payload: LoginRequest) => Promise<UserRead>
  register: (payload: UserCreate) => Promise<UserRead>
  logout: () => Promise<void>
  setUser: (user: UserRead) => void
  /** Called by the API client when the session can no longer be refreshed. */
  expireSession: () => void
}

let bootPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  sessionEnd: null,

  boot: () => {
    bootPromise ??= authApi
      .me()
      .then((user) => set({ user, status: 'authenticated' }))
      .catch(() => set({ user: null, status: 'anonymous' }))
    return bootPromise
  },

  login: async (payload) => {
    const { user } = await authApi.login(payload)
    set({ user, status: 'authenticated', sessionEnd: null })
    return user
  },

  register: (payload) => authApi.register(payload),

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // The server session may already be gone; the local session is cleared regardless.
    }
    set({ user: null, status: 'anonymous', sessionEnd: 'logout' })
  },

  setUser: (user) => set({ user }),

  expireSession: () => {
    const wasAuthenticated = get().status === 'authenticated'
    set({ user: null, status: 'anonymous', sessionEnd: wasAuthenticated ? 'expired' : get().sessionEnd })
    if (wasAuthenticated) toast.error('Sua sessão expirou. Entre novamente.')
  },
}))

setSessionExpiredHandler(() => useAuthStore.getState().expireSession())

export const selectIsAdmin = (state: Pick<AuthState, 'user'>) => state.user?.role === 'admin'
