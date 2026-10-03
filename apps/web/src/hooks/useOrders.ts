import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import type { OrderCreate, OrderRead, OrderStatus, OrderStatusUpdate } from '../api/types'
import { useAuthStore } from '../stores/auth.store'

const ORDERS_KEY = ['orders']

type OrdersOptions =
  | boolean
  | {
      enabled?: boolean
      scope?: 'all' | 'mine'
    }

export const useOrders = (options: OrdersOptions = true) => {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const enabled = typeof options === 'boolean' ? options : options.enabled ?? true
  const scope = typeof options === 'boolean' ? 'all' : options.scope ?? 'all'

  const ordersQuery = useQuery({
    queryKey: ORDERS_KEY,
    queryFn: ordersApi.list,
    enabled,
  })

  const createMutation = useMutation({
    mutationFn: (payload: OrderCreate) => ordersApi.create(payload),
    onSuccess: (order) => {
      queryClient.setQueryData<OrderRead[]>(ORDERS_KEY, (prev) =>
        prev ? [order, ...prev] : [order],
      )
    },
    retry: 0,
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: OrderStatusUpdate }) =>
      ordersApi.updateStatus(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY })
      const previous = queryClient.getQueryData<OrderRead[]>(ORDERS_KEY)
      if (previous) {
        queryClient.setQueryData<OrderRead[]>(ORDERS_KEY, (current) =>
          current
            ? current.map((order) =>
                order.id === id ? { ...order, status: payload.status } : order,
              )
            : current,
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<OrderRead[]>(ORDERS_KEY, context.previous)
      }
    },
    onSuccess: (order) => {
      queryClient.setQueryData<OrderRead[]>(ORDERS_KEY, (current) =>
        current ? current.map((item) => (item.id === order.id ? order : item)) : [order],
      )
    },
    retry: 0,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => ordersApi.updateStatus(id, { status: 'canceled' }),
    onSuccess: (order) => {
      queryClient.setQueryData<OrderRead[]>(ORDERS_KEY, (current) =>
        current ? current.map((item) => (item.id === order.id ? order : item)) : [order],
      )
    },
    retry: 0,
  })

  return {
    orders: (ordersQuery.data ?? [])
      .filter((order) => (scope === 'mine' && currentUser ? order.customer_id === currentUser.id : true))
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    ordersQuery,
    createOrder: createMutation.mutateAsync,
    updateOrderStatus: updateStatusMutation.mutateAsync,
    cancelOrder: cancelMutation.mutateAsync,
  }
}

export const useOrderDetail = (id: number) => {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.get(id),
    enabled: Number.isFinite(id),
  })
}

export const useOrderTracking = (id: number) => {
  return useQuery({
    queryKey: ['tracking', id],
    queryFn: () => ordersApi.tracking(id),
    enabled: Number.isFinite(id),
  })
}

export const ORDER_FLOW: OrderStatus[] = [
  'created',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
]
