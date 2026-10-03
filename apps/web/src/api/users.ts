import { api } from './client'
import type { UserCreate, UserRead, UserUpdate } from './types'

export const usersApi = {
  async list() {
    const { data } = await api.get<UserRead[]>('/users/')
    return data
  },
  async create(payload: UserCreate) {
    const { data } = await api.post<UserRead>('/users/', payload)
    return data
  },
  async me() {
    const { data } = await api.get<UserRead>('/users/me')
    return data
  },
  async updateMe(payload: UserUpdate) {
    const { data } = await api.patch<UserRead>('/users/me', payload)
    return data
  },
  async deactivate(id: number) {
    const { data } = await api.patch<UserRead>(`/users/${id}/deactivate`)
    return data
  },
  async activate(id: number) {
    const { data } = await api.patch<UserRead>(`/users/${id}/activate`)
    return data
  },
}
