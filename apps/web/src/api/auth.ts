import { api } from './client'
import type { UserCreate, UserRead } from './types'

export const authApi = {
  async login(email: string, password: string) {
    await api.post('/auth/login', { email, password }, { skipAuth: true })
  },
  async register(payload: UserCreate) {
    const { data } = await api.post<UserRead>('/auth/register', payload, { skipAuth: true })
    return data
  },
  async me(skipInterceptor = false) {
    const { data } = await api.get<UserRead>('/auth/me', skipInterceptor ? { skipAuth: true } : undefined)
    return data
  },
  async refresh() {
    await api.post('/auth/refresh', {}, { skipAuth: true })
  },
  async logout() {
    await api.post('/auth/logout', {})
  },
}
