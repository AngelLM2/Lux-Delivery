import { api } from './client'
import type { ProductCreate, ProductRead, ProductUpdate } from './types'

export const productsApi = {
  async list(limit = 20, cursor = 0) {
    const { data } = await api.get<ProductRead[]>('/products/', { params: { limit, cursor } })
    return data
  },
  async get(id: number) {
    const { data } = await api.get<ProductRead>(`/products/${id}`)
    return data
  },
  async create(payload: ProductCreate) {
    const { data } = await api.post<ProductRead>('/products/', payload)
    return data
  },
  async update(id: number, payload: ProductUpdate) {
    const { data } = await api.patch<ProductRead>(`/products/${id}`, payload)
    return data
  },
  async uploadImage(id: number, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<ProductRead>(`/products/${id}/image`, formData,)
    return data
  },
  async remove(id: number) {
    await api.delete(`/products/${id}`)
  },
}
