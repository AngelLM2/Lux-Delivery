import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrderDetail, useOrderTracking } from '../../hooks/useOrders'
import { useProducts } from '../../hooks/useProducts'
import { OrderTimeline } from '../../components/order/OrderTimeline'
import { StatusPill } from '../../components/order/StatusPill'
import { Button } from '../../components/ui/Button'
import { formatCurrency, formatDateTime } from '../../utils/formatters'
import { usePageMeta } from '../../hooks/usePageMeta'

export const OrderDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const orderId = Number(id)
  const orderQuery = useOrderDetail(orderId)
  const trackingQuery = useOrderTracking(orderId)
  const { products } = useProducts()

  usePageMeta(`Order #${id} — Lux Delivery`)

  const productMap = useMemo(() => {
    const map = new Map<number, string>()
    products.forEach((product) => map.set(product.id, product.name))
    return map
  }, [products])

  if (orderQuery.isLoading) {
    return (
      <div className="container page">
        <p className="body-text">Loading order...</p>
      </div>
    )
  }

  const order = orderQuery.data
  if (!order) {
    return (
      <div className="container page">
        <p className="body-text">Order not found.</p>
      </div>
    )
  }

  const tracking = trackingQuery.data ?? order.tracking_events ?? []

  return (
    <div className="container page">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/orders')}
        style={{ marginBottom: '1rem' }}
      >
        Back to orders
      </Button>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Order details</p>
          <h1 className="h1" style={{ margin: 0 }}>Order #{order.id}</h1>
          <p className="caption" style={{ marginTop: '0.5rem' }}>{formatDateTime(order.created_at)}</p>
        </div>
        <StatusPill status={order.status} />
      </header>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>Delivery address</span>
            <p className="body-text" style={{ margin: 0, color: 'var(--color-ink)' }}>{order.delivery_address}</p>
          </div>

          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>Total</span>
            <span className="price-text">{formatCurrency(order.total_amount)}</span>
          </div>

          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Items</span>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.25rem' }}>
              {order.items.map((item) => (
                <li key={item.id} className="body-text" style={{ margin: 0 }}>
                  {productMap.get(item.product_id) ?? `Product #${item.product_id}`} x {item.quantity}
                </li>
              ))}
            </ul>
          </div>

          {order.notes && (
            <div>
              <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>Notes</span>
              <p className="body-text" style={{ margin: 0, color: 'var(--color-ink)' }}>{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      <section>
        <h2 className="h2" style={{ marginBottom: '1rem' }}>Timeline</h2>
        {tracking.length === 0 ? (
          <p className="body-text">No events yet.</p>
        ) : (
          <OrderTimeline events={tracking} />
        )}
      </section>
    </div>
  )
}
