import { useState } from 'react'
import { useRealtimeStatus } from '../../../app/realtime'
import type { OrderStatus, OrderSummary } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { formatStatusLabel } from '../../../shared/lib/formatters'
import { Alert } from '../../../shared/ui/Alert'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { LiveIndicator } from '../../../shared/ui/LiveIndicator'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Modal } from '../../../shared/ui/Modal'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useOrderList, usePendingStatusChanges, useUpdateOrderStatus } from '../../orders/hooks'
import { ORDER_STATUSES, getNextStatus } from '../../orders/status'
import { AdminOrderCard } from '../components/AdminOrderCard'

const TABS: Array<OrderStatus | null> = [null, ...ORDER_STATUSES]

export const AdminOrdersPage = () => {
  const [status, setStatus] = useState<OrderStatus | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OrderSummary | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const ordersQuery = useOrderList({ status })
  const updateStatus = useUpdateOrderStatus()
  const pendingIds = usePendingStatusChanges()
  const realtimeStatus = useRealtimeStatus()

  usePageMeta('Pedidos — Admin')

  const advance = (order: OrderSummary) => {
    const next = getNextStatus(order.status)
    if (next) updateStatus.mutate({ id: order.id, status: next })
  }

  const closeCancel = () => {
    setCancelTarget(null)
    setCancelReason('')
  }

  const confirmCancel = () => {
    if (!cancelTarget) return
    updateStatus.mutate(
      { id: cancelTarget.id, status: 'canceled', description: cancelReason.trim() || null },
      { onSettled: closeCancel },
    )
  }

  return (
    <div>
      <header
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Operação</p>
          <h2 className="h1" style={{ margin: 0 }}>Pedidos</h2>
        </div>
        <LiveIndicator status={realtimeStatus} />
      </header>

      <div className="filter-pills" role="group" aria-label="Filtrar por status" style={{ marginBottom: '1.5rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab ?? 'all'}
            type="button"
            aria-pressed={tab === status}
            className={`filter-pill ${tab === status ? 'active' : ''}`}
            onClick={() => setStatus(tab)}
          >
            {tab ? formatStatusLabel(tab) : 'Todos'}
          </button>
        ))}
      </div>

      <div className="table-grid">
        {ordersQuery.isPending ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={160} />)
        ) : ordersQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar os pedidos.</Alert>
        ) : ordersQuery.orders.length === 0 ? (
          <EmptyState
            title="Nenhum pedido"
            description={
              status ? `Nenhum pedido com status "${formatStatusLabel(status)}".` : 'Os pedidos aparecerão aqui assim que chegarem.'
            }
          />
        ) : (
          ordersQuery.orders.map((order) => (
            <AdminOrderCard
              key={order.id}
              order={order}
              isPending={pendingIds.includes(order.id)}
              onAdvance={() => advance(order)}
              onCancel={() => setCancelTarget(order)}
            />
          ))
        )}
      </div>

      <LoadMore
        hasNextPage={ordersQuery.hasNextPage}
        isFetchingNextPage={ordersQuery.isFetchingNextPage}
        onLoadMore={() => void ordersQuery.fetchNextPage()}
      />

      <Modal
        isOpen={cancelTarget !== null}
        title={`Cancelar pedido #${cancelTarget?.id ?? ''}?`}
        description="O cliente será notificado. Esta ação não pode ser desfeita."
        onClose={closeCancel}
        onConfirm={confirmCancel}
        confirmLabel="Cancelar pedido"
        confirmVariant="danger"
        isConfirming={updateStatus.isPending}
      >
        <InputField
          label="Motivo (opcional)"
          maxLength={255}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
    </div>
  )
}
