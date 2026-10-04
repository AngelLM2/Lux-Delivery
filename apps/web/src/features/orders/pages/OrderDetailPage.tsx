import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRealtimeStatus } from '../../../app/realtime'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { getErrorStatus } from '../../../shared/lib/errors'
import { formatCurrency, formatDateTime } from '../../../shared/lib/formatters'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { LiveIndicator } from '../../../shared/ui/LiveIndicator'
import { Loading } from '../../../shared/ui/Loading'
import { Modal } from '../../../shared/ui/Modal'
import { useAuthStore } from '../../auth/store'
import { OrderProgress } from '../components/OrderProgress'
import { OrderTimeline } from '../components/OrderTimeline'
import { StatusPill } from '../components/StatusPill'
import { useOrderDetail, useUpdateOrderStatus } from '../hooks'
import { canCustomerCancel } from '../status'
import '../orders.css'

const BackLink = () => (
  <Link to="/orders" className="back-link">
    <ArrowLeft size={16} aria-hidden="true" />
    Meus pedidos
  </Link>
)

export const OrderDetailPage = () => {
  const { id } = useParams()
  const orderId = Number(id)
  const isValidId = Number.isInteger(orderId) && orderId > 0
  const orderQuery = useOrderDetail(orderId)
  const updateStatus = useUpdateOrderStatus()
  const realtimeStatus = useRealtimeStatus()
  const userId = useAuthStore((state) => state.user?.id)
  const [confirmCancel, setConfirmCancel] = useState(false)

  usePageMeta(`Pedido #${id ?? ''}`)

  if (isValidId && orderQuery.isPending) {
    return (
      <div className="container page">
        <Loading label="Carregando pedido..." />
      </div>
    )
  }

  const order = orderQuery.data
  if (!order) {
    const notFound = !isValidId || getErrorStatus(orderQuery.error) === 404
    return (
      <div className="container page order-detail">
        <BackLink />
        <Alert tone={notFound ? 'warning' : 'danger'}>
          {notFound ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido. Tente novamente.'}
        </Alert>
      </div>
    )
  }

  const isOwner = order.customer_id === userId
  const showCancel = isOwner && canCustomerCancel(order.status)

  return (
    <div className="container page order-detail">
      <BackLink />

      <header className="order-detail-head">
        <div>
          <h1 className="orders-title">Pedido #{order.id}</h1>
          <p className="caption" style={{ margin: '0.35rem 0 0' }}>{formatDateTime(order.created_at)}</p>
        </div>
        <div className="order-detail-badges">
          <LiveIndicator status={realtimeStatus} />
          <StatusPill status={order.status} />
        </div>
      </header>

      {order.status !== 'canceled' && (
        <section className="card order-detail-progress" aria-label="Andamento do pedido">
          <OrderProgress status={order.status} />
        </section>
      )}

      <div className="order-detail-grid">
        <section className="card order-detail-card" aria-labelledby="order-items-title">
          <h2 id="order-items-title" className="h3">Itens</h2>
          <ul className="order-lines">
            {order.items.map((item) => (
              <li key={item.id}>
                <span>
                  <span className="order-line-qty">{item.quantity}x</span> {item.product_name}
                </span>
                <span className="price-text">{formatCurrency(item.total_price)}</span>
              </li>
            ))}
          </ul>
          <div className="order-total">
            <span>Total</span>
            <strong className="price-text">{formatCurrency(order.total_amount)}</strong>
          </div>
        </section>

        <div className="order-detail-side">
          <section className="card order-detail-card" aria-labelledby="order-delivery-title">
            <h2 id="order-delivery-title" className="h3">Entrega</h2>
            <p className="order-detail-text">{order.delivery_address}</p>
            {order.notes && (
              <p className="order-detail-text">
                <span className="caption">Observações</span>
                <br />
                {order.notes}
              </p>
            )}
            {showCancel && (
              <div>
                <Button variant="ghost" size="sm" className="btn-ghost-danger" onClick={() => setConfirmCancel(true)}>
                  Cancelar pedido
                </Button>
              </div>
            )}
          </section>

          <section className="card order-detail-card" aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="h3">Acompanhamento</h2>
            {order.tracking_events.length === 0 ? (
              <p className="body-text" style={{ margin: 0 }}>Nenhuma atualização ainda.</p>
            ) : (
              <OrderTimeline events={order.tracking_events} />
            )}
          </section>
        </div>
      </div>

      <Modal
        isOpen={confirmCancel}
        title="Cancelar este pedido?"
        description="Esta ação não pode ser desfeita."
        onClose={() => setConfirmCancel(false)}
        onConfirm={() =>
          updateStatus.mutate(
            { id: order.id, status: 'canceled', description: 'Cancelado pelo cliente.' },
            { onSettled: () => setConfirmCancel(false) },
          )
        }
        confirmLabel="Cancelar pedido"
        confirmVariant="danger"
        isConfirming={updateStatus.isPending}
      />
    </div>
  )
}
