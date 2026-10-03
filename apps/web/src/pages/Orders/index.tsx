import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders } from '../../hooks/useOrders'
import { OrderCard } from '../../components/order/OrderCard'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { usePageMeta } from '../../hooks/usePageMeta'

const TABS = ['Active', 'Delivered', 'Canceled'] as const

export const OrdersPage = () => {
  const { orders, cancelOrder } = useOrders({ scope: 'mine' })
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Active')
  const [cancelId, setCancelId] = useState<number | null>(null)
  const navigate = useNavigate()

  usePageMeta('Orders — Lux Delivery')

  const filtered = useMemo(() => {
    if (activeTab === 'Delivered') {
      return orders.filter((order) => order.status === 'delivered')
    }
    if (activeTab === 'Canceled') {
      return orders.filter((order) => order.status === 'canceled')
    }
    return orders.filter((order) => order.status !== 'delivered' && order.status !== 'canceled')
  }, [orders, activeTab])

  const handleCancel = async () => {
    if (!cancelId) return
    await cancelOrder(cancelId)
    setCancelId(null)
  }

  return (
    <div className="container page">
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Track your deliveries</p>
        <h1 className="h1" style={{ margin: 0 }}>My orders</h1>
      </header>

      <div className="filter-pills" style={{ marginBottom: '1.5rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`filter-pill ${tab === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {filtered.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Your orders will appear here."
          />
        ) : (
          filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onView={() => navigate(`/orders/${order.id}`)}
              canCancel={['created', 'confirmed'].includes(order.status)}
              onCancel={() => setCancelId(order.id)}
            />
          ))
        )}
      </div>

      <Modal
        isOpen={!!cancelId}
        title="Cancel this order?"
        description="This action cannot be undone."
        onClose={() => setCancelId(null)}
        onConfirm={handleCancel}
        confirmLabel="Cancel order"
        confirmVariant="danger"
      />
    </div>
  )
}
