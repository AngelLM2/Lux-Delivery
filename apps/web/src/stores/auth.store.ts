import { create } from 'zustand'
import { authApi } from '../api/auth'
import type { UserCreate, UserRead } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthState = {
  user: UserRead | null
  status: AuthStatus
  error: string | null
  booted: boolean
  boot: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (payload: UserCreate) => Promise<UserRead>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  error: null,
  booted: false,
  boot: async () => {
    if (get().booted) return
    set({ booted: true, status: 'loading' })
    try {
      const profile = await authApi.me(true)
      set({ user: profile, status: 'authenticated' })
    } catch {
      try {
        await authApi.refresh()
        const profile = await authApi.me(true)
        set({ user: profile, status: 'authenticated' })
      } catch {
        set({ user: null, status: 'anonymous' })
      }
    }
  },
  login: async (email, password) => {
    set({ status: 'loading', error: null })
    try {
      await authApi.login(email, password)
      const profile = await authApi.me(true)
      set({ user: profile, status: 'authenticated' })
    } catch (error: any) {
      set({ user: null, status: 'anonymous', error: 'Unable to sign in.' })
      throw error
    }
  },
  register: async (payload) => {
    set({ error: null })
    const result = await authApi.register(payload)
    return result
  },
  logout: async () => {
    try {
      await authApi.logout()
    } catch {
    }
    set({ user: null, status: 'anonymous' })
  },
  refreshProfile: async () => {
    if (!get().user) return
    try {
      const profile = await authApi.me()
      set({ user: profile, status: 'authenticated' })
    } catch {
      set({ error: 'Unable to load profile.' })
    }
  },
}))
