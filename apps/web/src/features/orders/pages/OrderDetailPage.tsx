import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { OrderTimeline } from '../components/OrderTimeline'
import { StatusPill } from '../components/StatusPill'
import { useOrderDetail, useUpdateOrderStatus } from '../hooks'
import { canCustomerCancel } from '../status'

export const OrderDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const orderId = Number(id)
  const isValidId = Number.isInteger(orderId) && orderId > 0
  const orderQuery = useOrderDetail(orderId)
  const updateStatus = useUpdateOrderStatus()
  const realtimeStatus = useRealtimeStatus()
  const userId = useAuthStore((state) => state.user?.id)
  const [confirmCancel, setConfirmCancel] = useState(false)

  usePageMeta(`Pedido #${id ?? ''}`)

  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/orders')} style={{ marginBottom: '1rem' }}>
      ← Voltar para pedidos
    </Button>
  )

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
      <div className="container page">
        {backButton}
        <Alert tone={notFound ? 'warning' : 'danger'}>
          {notFound ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido. Tente novamente.'}
        </Alert>
      </div>
    )
  }

  const isOwner = order.customer_id === userId
  const showCancel = isOwner && canCustomerCancel(order.status)

  return (
    <div className="container page">
      {backButton}

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Detalhes do pedido</p>
          <h1 className="h1" style={{ margin: 0 }}>Pedido #{order.id}</h1>
          <p className="caption" style={{ marginTop: '0.5rem' }}>{formatDateTime(order.created_at)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <LiveIndicator status={realtimeStatus} />
          <StatusPill status={order.status} />
        </div>
      </header>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>Endereço de entrega</span>
            <p className="body-text" style={{ margin: 0, color: 'var(--color-ink)' }}>{order.delivery_address}</p>
          </div>

          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Itens</span>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col" className="numeric">Qtd.</th>
                  <th scope="col" className="numeric">Unitário</th>
                  <th scope="col" className="numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td className="numeric">{item.quantity}</td>
                    <td className="numeric">{formatCurrency(item.unit_price)}</td>
                    <td className="numeric">{formatCurrency(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>Total do pedido</th>
                  <td className="numeric price-text">{formatCurrency(order.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {order.notes && (
            <div>
              <span className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>Observações</span>
              <p className="body-text" style={{ margin: 0, color: 'var(--color-ink)' }}>{order.notes}</p>
            </div>
          )}

          {showCancel && (
            <div>
              <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                Cancelar pedido
              </Button>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="h2" style={{ marginBottom: '1rem' }}>Acompanhamento</h2>
        {order.tracking_events.length === 0 ? (
          <p className="body-text">Nenhuma atualização ainda.</p>
        ) : (
          <OrderTimeline events={order.tracking_events} />
        )}
      </section>

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
