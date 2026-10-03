import { useMemo, useState } from 'react'
import { useOrders, ORDER_FLOW } from '../../../hooks/useOrders'
import { useProducts } from '../../../hooks/useProducts'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '../../../api/users'
import type { OrderStatus } from '../../../api/types'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { formatCurrency, formatDateTime, formatStatusLabel } from '../../../utils/formatters'
import { usePageMeta } from '../../../hooks/usePageMeta'

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['confirmed', 'canceled'],
  confirmed: ['preparing', 'canceled'],
  preparing: ['out_for_delivery', 'canceled'],
  out_for_delivery: ['delivered', 'canceled'],
  delivered: [],
  canceled: [],
}

const FINAL_STATUSES: OrderStatus[] = ['delivered', 'canceled']

export const AdminOrdersPage = () => {
  const { orders, updateOrderStatus } = useOrders({ scope: 'all' })
  const { products } = useProducts()
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list })
  const [statusNotes, setStatusNotes] = useState<Record<number, string>>({})
  const [statusSelection, setStatusSelection] = useState<Record<number, OrderStatus | null>>({})
  const [nameFilter, setNameFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('pending')

  usePageMeta('Admin - Orders')

  const userMap = useMemo(() => {
    const map = new Map<number, string>()
    usersQuery.data?.forEach((user) => map.set(user.id, user.full_name))
    return map
  }, [usersQuery.data])

  const productMap = useMemo(() => {
    const map = new Map<number, string>()
    products.forEach((product) => map.set(product.id, product.name))
    return map
  }, [products])
  const normalizedNameFilter = nameFilter.trim().toLowerCase()

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const customerName = userMap.get(order.customer_id) || `Customer #${order.customer_id}`
      const matchesStatus =
        statusFilter === 'pending' ? !FINAL_STATUSES.includes(order.status) : true
      const matchesName = normalizedNameFilter
        ? customerName.toLowerCase().includes(normalizedNameFilter)
        : true
      return matchesStatus && matchesName
    })
  }, [orders, userMap, statusFilter, normalizedNameFilter])

  const handleApply = async (orderId: number) => {
    const status = statusSelection[orderId]
    if (!status) return
    await updateOrderStatus({ id: orderId, payload: { status, description: statusNotes[orderId] } })
    setStatusSelection((prev) => ({ ...prev, [orderId]: null }))
    setStatusNotes((prev) => ({ ...prev, [orderId]: '' }))
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Manage</p>
        <h2 className="h1" style={{ margin: 0 }}>Orders</h2>
      </header>

      {orders.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', display: 'grid', gap: '1rem' }}>
          <div className="filter-pills">
            <button
              className={`filter-pill ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </button>
            <button
              className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
          </div>
          <div style={{ maxWidth: 360 }}>
            <InputField
              label="Search customer"
              type="search"
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Type customer name"
            />
          </div>
        </div>
      )}

      <div className="table-grid">
        {orders.length === 0 ? (
          <EmptyState title="No orders" description="Orders will appear here as they come in." />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title="No matching orders"
            description="Try clearing filters or searching another customer."
          />
        ) : (
          filteredOrders.map((order) => {
            const currentIndex = ORDER_FLOW.indexOf(order.status)
            const isCanceled = order.status === 'canceled'
            const customerName = userMap.get(order.customer_id) || `Customer #${order.customer_id}`

            return (
              <article className="card" key={order.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <h3 className="h3" style={{ margin: 0 }}>Order #{order.id}</h3>
                    <p className="caption" style={{ margin: 0 }}>Customer: {customerName}</p>
                    <p className="caption" style={{ margin: 0 }}>{order.delivery_address}</p>
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: '0.25rem' }}>
                    <Badge tone={order.status === 'delivered' ? 'success' : order.status === 'canceled' ? 'error' : 'info'}>
                      {formatStatusLabel(order.status)}
                    </Badge>
                    <span className="price-text">{formatCurrency(order.total_amount)}</span>
                    <span className="caption">{formatDateTime(order.created_at)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {order.items.map((item) => (
                    <span key={item.id} className="category-pill">
                      {productMap.get(item.product_id) ?? `Product ${item.product_id}`} x{item.quantity}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', borderTop: '1px solid var(--color-line)', paddingTop: '1rem' }}>
                  {ORDER_FLOW.map((status) => {
                    const completed = !isCanceled && ORDER_FLOW.indexOf(status) <= currentIndex
                    const allowed = ALLOWED_TRANSITIONS[order.status]?.includes(status)
                    const selected = statusSelection[order.id] === status
                    const disabled = completed || !allowed || isCanceled

                    return (
                      <label
                        key={status}
                        className={`status-pill ${status}`}
                        style={{
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={completed || selected}
                          disabled={disabled}
                          onChange={() =>
                            setStatusSelection((prev) => ({
                              ...prev,
                              [order.id]: prev[order.id] === status ? null : status,
                            }))
                          }
                          style={{ accentColor: 'var(--color-ink)' }}
                        />
                        {formatStatusLabel(status)}
                      </label>
                    )
                  })}
                  <label
                    className="status-pill canceled"
                    style={{
                      cursor: isCanceled || !ALLOWED_TRANSITIONS[order.status]?.includes('canceled') ? 'not-allowed' : 'pointer',
                      opacity: isCanceled || !ALLOWED_TRANSITIONS[order.status]?.includes('canceled') ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={order.status === 'canceled' || statusSelection[order.id] === 'canceled'}
                      disabled={isCanceled || !ALLOWED_TRANSITIONS[order.status]?.includes('canceled')}
                      onChange={() =>
                        setStatusSelection((prev) => ({
                          ...prev,
                          [order.id]: prev[order.id] === 'canceled' ? null : 'canceled',
                        }))
                      }
                      style={{ accentColor: 'var(--color-error)' }}
                    />
                    Cancel
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                  <InputField
                    label="Status note (optional)"
                    value={statusNotes[order.id] ?? ''}
                    onChange={(event) =>
                      setStatusNotes((prev) => ({ ...prev, [order.id]: event.target.value }))
                    }
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleApply(order.id)}
                    disabled={!statusSelection[order.id]}
                  >
                    Apply
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
