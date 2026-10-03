import {
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { PAGE_SIZE, cursorPagination, flattenPages, mapPages } from '../../shared/api/pagination'
import type { OrderCreate, OrderRead, OrderStatus, OrderSummary, Page } from '../../shared/api/types'
import { getErrorStatus } from '../../shared/lib/errors'
import { formatStatusLabel } from '../../shared/lib/formatters'
import { toast } from '../../shared/stores/ui.store'
import { ordersApi } from './api'
import { describeStatusChangeError } from './status'

export type OrderListFilters = {
  status?: OrderStatus | null
  /** Admins: only their own orders (customers always get only theirs). */
  mine?: boolean
}

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: OrderListFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: number) => [...orderKeys.details(), id] as const,
}

export const useOrderList = (filters: OrderListFilters) => {
  const query = useInfiniteQuery({
    queryKey: orderKeys.list(filters),
    queryFn: ({ pageParam }) =>
      ordersApi.list({
        status: filters.status ?? undefined,
        mine: filters.mine || undefined,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    ...cursorPagination,
  })
  return { ...query, orders: flattenPages(query.data) }
}

export const useOrderDetail = (id: number) =>
  useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersApi.get(id),
    enabled: Number.isInteger(id) && id > 0,
  })

/** Writes a fresh order into the detail cache and into every cached list page. */
const syncOrderCaches = (queryClient: QueryClient, order: OrderRead) => {
  queryClient.setQueryData(orderKeys.detail(order.id), order)
  // List items are summaries: they do not carry the tracking history.
  const { tracking_events, ...summary } = order
  queryClient.setQueriesData<InfiniteData<Page<OrderSummary>>>({ queryKey: orderKeys.lists() }, (data) =>
    mapPages(data, (item) => (item.id === order.id ? { ...item, ...summary } : item)),
  )
}

type CreateOrderInput = { payload: OrderCreate; idempotencyKey: string }

export const useCreateOrder = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateOrderInput) => ordersApi.create(payload, idempotencyKey),
    onSuccess: ({ order }) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order)
      return queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
    },
  })
}

export type UpdateOrderStatusInput = {
  id: number
  status: OrderStatus
  description?: string | null
}

const UPDATE_STATUS_KEY = [...orderKeys.all, 'update-status'] as const

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: UPDATE_STATUS_KEY,
    mutationFn: ({ id, status, description }: UpdateOrderStatusInput) =>
      ordersApi.updateStatus(id, { status, description: description || null }),
    onSuccess: (order) => {
      syncOrderCaches(queryClient, order)
      toast.success(
        order.status === 'canceled'
          ? `Pedido #${order.id} cancelado.`
          : `Pedido #${order.id}: ${formatStatusLabel(order.status)}.`,
      )
    },
    onError: (error, { id }) => {
      toast.error(describeStatusChangeError(error))
      // 409: someone else moved the order first; show the current state right away.
      if (getErrorStatus(error) === 409) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) })
      }
    },
    // Status-filtered lists must drop/gain the order, so always refetch them.
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
  })
}

/** Ids of the orders with a status change in flight (several can run in parallel). */
export const usePendingStatusChanges = () =>
  useMutationState({
    filters: { mutationKey: UPDATE_STATUS_KEY, status: 'pending' },
    select: (mutation) => (mutation.state.variables as UpdateOrderStatusInput | undefined)?.id,
  })
