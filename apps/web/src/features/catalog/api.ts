import { api } from '../../shared/api/client'
import type {
  AdminProductListParams,
  CategoryCreate,
  CategoryRead,
  CategoryUpdate,
  Page,
  ProductCreate,
  ProductListParams,
  ProductRead,
  ProductUpdate,
} from '../../shared/api/types'

/** Drops `undefined`/empty values so the query string only carries real filters. */
const compact = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false),
  ) as Partial<T>

export const productsApi = {
  /** Public catalog: only active (non-archived) products. */
  async list(params: ProductListParams = {}) {
    const { data } = await api.get<Page<ProductRead>>('/products', { params: compact(params) })
    return data
  },
  /** Admin listing, archived products included. */
  async listAdmin(params: AdminProductListParams = {}) {
    const { data } = await api.get<Page<ProductRead>>('/products/admin', { params: compact(params) })
    return data
  },
  async get(id: number) {
    const { data } = await api.get<ProductRead>(`/products/${id}`)
    return data
  },
  async create(payload: ProductCreate) {
    const { data } = await api.post<ProductRead>('/products', payload, { skipErrorToast: true })
    return data
  },
  async update(id: number, payload: ProductUpdate) {
    const { data } = await api.patch<ProductRead>(`/products/${id}`, payload, { skipErrorToast: true })
    return data
  },
  /** Soft delete: the product disappears from the catalog but stays in past orders. */
  async archive(id: number) {
    await api.delete(`/products/${id}`)
  },
  async restore(id: number) {
    const { data } = await api.post<ProductRead>(`/products/${id}/restore`)
    return data
  },
  async uploadImage(id: number, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    // Let the browser set the multipart boundary.
    const { data } = await api.post<ProductRead>(`/products/${id}/image`, formData, { timeout: 60_000 })
    return data
  },
}

/** Forces the browser to revalidate a response the API marked as publicly cacheable. */
const BYPASS_HTTP_CACHE = { headers: { 'Cache-Control': 'no-cache' } }

export const categoriesApi = {
  /**
   * `GET /categories` is served with `Cache-Control: public, max-age=30`. That is right for the
   * storefront, but admin screens must see their own changes immediately: `fresh` revalidates.
   */
  async list({ fresh = false }: { fresh?: boolean } = {}) {
    const { data } = await api.get<CategoryRead[]>('/categories', fresh ? BYPASS_HTTP_CACHE : undefined)
    return data
  },
  async create(payload: CategoryCreate) {
    const { data } = await api.post<CategoryRead>('/categories', payload, { skipErrorToast: true })
    return data
  },
  async update(id: number, payload: CategoryUpdate) {
    const { data } = await api.patch<CategoryRead>(`/categories/${id}`, payload, { skipErrorToast: true })
    return data
  },
  async remove(id: number) {
    await api.delete(`/categories/${id}`)
  },
}
