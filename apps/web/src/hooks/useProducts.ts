import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../api/products'
import { categoriesApi } from '../api/categories'
import type { ProductCreate, ProductRead, ProductUpdate } from '../api/types'

const PRODUCTS_KEY = ['products']
const CATEGORIES_KEY = ['categories']

type UseProductsOptions = {
  includeCategories?: boolean
  pageSize?: number
}

export const useProducts = ({ includeCategories = true, pageSize = 20 }: UseProductsOptions = {}) => {
  const queryClient = useQueryClient()
  const productsKey = [...PRODUCTS_KEY, pageSize] as const

  const categoriesQuery = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: categoriesApi.list,
    staleTime: 60_000,
    gcTime: 300_000,
    enabled: includeCategories,
  })

  const productsQuery = useInfiniteQuery<ProductRead[]>({
    queryKey: productsKey,
    queryFn: ({ pageParam = 0 }) => productsApi.list(pageSize, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined
      return lastPage[lastPage.length - 1].id
    },
    staleTime: 60_000,
    gcTime: 300_000,
  })

  const createMutation = useMutation({
    mutationFn: (payload: ProductCreate) => productsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
    retry: 0,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductUpdate }) =>
      productsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
    retry: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
    retry: 0,
  })

  const products: ProductRead[] = productsQuery.data?.pages.flat() ?? []

  return {
    categories: categoriesQuery.data ?? [],
    products,
    productsQuery,
    categoriesQuery,
    createProduct: createMutation.mutateAsync,
    updateProduct: updateMutation.mutateAsync,
    deleteProduct: deleteMutation.mutateAsync,
  }
}
