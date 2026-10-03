import { api } from '../../shared/api/client'
import type { UserRead, UserUpdate } from '../../shared/api/types'

export const profileApi = {
  /** PATCH semantics: only the fields sent change. Password changes need `current_password`. */
  async updateMe(payload: UserUpdate) {
    const { data } = await api.patch<UserRead>('/users/me', payload, { skipErrorToast: true })
    return data
  },
}
