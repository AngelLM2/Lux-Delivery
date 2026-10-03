import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PAGE_SIZE, cursorPagination, flattenPages } from '../../shared/api/pagination'
import type { AdminUserCreate, OrdersAnalyticsParams, UserRole } from '../../shared/api/types'
import { toast } from '../../shared/stores/ui.store'
import { analyticsApi, usersApi } from './api'

export const analyticsKeys = {
  all: ['analytics'] as const,
  orders: (params: OrdersAnalyticsParams) => [...analyticsKeys.all, 'orders', params] as const,
}

export type UserFilters = { role?: UserRole | null; q?: string }

export const userKeys = {
  all: ['users'] as const,
  list: (filters: UserFilters) => [...userKeys.all, 'list', filters] as const,
}

export const useOrdersAnalytics = (params: OrdersAnalyticsParams) =>
  useQuery({
    queryKey: analyticsKeys.orders(params),
    queryFn: () => analyticsApi.orders(params),
    // Switching periods keeps the previous numbers on screen instead of flashing a loader.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

export const useUserList = (filters: UserFilters) => {
  // The API requires at least 2 characters for `q`.
  const q = filters.q && filters.q.length >= 2 ? filters.q : undefined
  const query = useInfiniteQuery({
    queryKey: userKeys.list({ role: filters.role ?? null, q }),
    queryFn: ({ pageParam }) =>
      usersApi.list({ role: filters.role ?? undefined, q, cursor: pageParam, limit: PAGE_SIZE }),
    ...cursorPagination,
    placeholderData: keepPreviousData,
  })
  return { ...query, users: flattenPages(query.data) }
}

export const useCreateUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdminUserCreate) => usersApi.create(payload),
    onSuccess: (user) => toast.success(`Usuário ${user.full_name} criado.`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export const useSetUserActive = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? usersApi.activate(id) : usersApi.deactivate(id),
    onSuccess: (user) =>
      toast.success(user.is_active ? `${user.full_name} foi reativado.` : `${user.full_name} foi desativado.`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}
