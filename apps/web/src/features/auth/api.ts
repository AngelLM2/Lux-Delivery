import { api } from '../../shared/api/client'
import type { LoginRequest, SessionResponse, UserCreate, UserRead } from '../../shared/api/types'

export const authApi = {
  /** Sets the HttpOnly session cookies; the body carries the user and the access expiry. */
  async login(payload: LoginRequest) {
    const { data } = await api.post<SessionResponse>('/auth/login', payload, { skipErrorToast: true })
    return data
  },
  async register(payload: UserCreate) {
    const { data } = await api.post<UserRead>('/auth/register', payload, { skipErrorToast: true })
    return data
  },
  /** Goes through the 401 -> refresh -> retry interceptor, so it also restores a session. */
  async me() {
    const { data } = await api.get<UserRead>('/auth/me', { skipErrorToast: true })
    return data
  },
  async logout() {
    await api.post('/auth/logout', undefined, { skipAuthRefresh: true, skipErrorToast: true })
  },
}
