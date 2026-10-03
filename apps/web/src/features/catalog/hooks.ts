import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PAGE_SIZE, cursorPagination, flattenPages } from '../../shared/api/pagination'
import type { CategoryCreate, CategoryRead, ProductCreate } from '../../shared/api/types'
import { toast } from '../../shared/stores/ui.store'
import { categoriesApi, productsApi } from './api'

export type ProductFilters = {
  categoryId?: number | null
  q?: string
}

export const catalogKeys = {
  products: ['products'] as const,
  productList: (filters: ProductFilters) => ['products', 'list', filters] as const,
  highlights: (limit: number) => ['products', 'highlights', limit] as const,
  adminProducts: (filters: ProductFilters) => ['products', 'admin', filters] as const,
  categories: ['categories'] as const,
}

const byPosition = (a: CategoryRead, b: CategoryRead) => a.position - b.position || a.name.localeCompare(b.name)

/** `fresh`: bypass the browser HTTP cache (admin screens that edit categories). */
export const useCategories = ({ fresh = false }: { fresh?: boolean } = {}) =>
  useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => categoriesApi.list({ fresh }),
    staleTime: 5 * 60_000,
    select: (categories) => [...categories].sort(byPosition),
  })

/** Public menu, filtered on the server (category + search) and paginated by cursor. */
export const useProductList = (filters: ProductFilters) => {
  const query = useInfiniteQuery({
    queryKey: catalogKeys.productList(filters),
    queryFn: ({ pageParam }) =>
      productsApi.list({
        category_id: filters.categoryId ?? undefined,
        q: filters.q || undefined,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    ...cursorPagination,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  return { ...query, products: flattenPages(query.data) }
}

export const useHighlightedProducts = (limit = 6) =>
  useQuery({
    queryKey: catalogKeys.highlights(limit),
    queryFn: () => productsApi.list({ highlights_only: true, limit }),
    staleTime: 60_000,
    select: (page) => page.items,
  })

export const useAdminProducts = (filters: ProductFilters) => {
  const query = useInfiniteQuery({
    queryKey: catalogKeys.adminProducts(filters),
    queryFn: ({ pageParam }) =>
      productsApi.listAdmin({
        category_id: filters.categoryId ?? undefined,
        q: filters.q || undefined,
        cursor: pageParam,
      }),
    ...cursorPagination,
    placeholderData: keepPreviousData,
  })
  return { ...query, products: flattenPages(query.data) }
}

type SaveProductInput = {
  id?: number
  payload: ProductCreate
  imageFile?: File | null
}

/** Create or update a product, then upload the image (separate multipart endpoint). */
export const useSaveProduct = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload, imageFile }: SaveProductInput) => {
      const saved = id ? await productsApi.update(id, payload) : await productsApi.create(payload)
      return imageFile ? productsApi.uploadImage(saved.id, imageFile) : saved
    },
    onSuccess: (product, { id }) => {
      toast.success(id ? `"${product.name}" atualizado.` : `"${product.name}" cadastrado.`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
  })
}

export const useArchiveProduct = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => productsApi.archive(id),
    onSuccess: () => toast.success('Produto arquivado. Ele não aparece mais no cardápio.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
  })
}

export const useRestoreProduct = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => productsApi.restore(id),
    onSuccess: (product) => toast.success(`"${product.name}" restaurado.`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
  })
}

export const useSaveCategory = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: CategoryCreate }) =>
      id ? categoriesApi.update(id, payload) : categoriesApi.create(payload),
    onSuccess: (category, { id }) =>
      toast.success(id ? `Categoria "${category.name}" atualizada.` : `Categoria "${category.name}" criada.`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.categories }),
  })
}

export const useDeleteCategory = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => toast.success('Categoria removida.'),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogKeys.categories }),
        // Products of a removed category lose their `category_id`.
        queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
      ]),
  })
}
