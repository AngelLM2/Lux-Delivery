import { api } from './client'
import type { CategoryCreate, CategoryRead, CategoryUpdate } from './types'

export const categoriesApi = {
  async list() {
    const { data } = await api.get<CategoryRead[]>('/categories/')
    return data
  },
  async create(payload: CategoryCreate) {
    const { data } = await api.post<CategoryRead>('/categories/post', payload)
    return data
  },
  async update(id: number, payload: CategoryUpdate) {
    const { data } = await api.patch<CategoryRead>(`/categories/patch/${id}`, payload)
    return data
  },
  async remove(id: number) {
    await api.delete(`/categories/delete/${id}`)
  },
}
