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
import { AdminOrderRow } from '../components/AdminOrderRow'
import { AdminPageHeader } from '../components/AdminPageHeader'

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
    <div className="admin-page">
      <AdminPageHeader title="Pedidos" actions={<LiveIndicator status={realtimeStatus} />} />

      <section className="card admin-card admin-list-card">
        <div className="text-tabs" role="group" aria-label="Filtrar por status">
          {TABS.map((tab) => (
            <button key={tab ?? 'all'} type="button" aria-pressed={tab === status} onClick={() => setStatus(tab)}>
              {tab ? formatStatusLabel(tab) : 'Todos'}
            </button>
          ))}
        </div>

        {ordersQuery.isPending ? (
          <div className="admin-rows">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} height={52} />
            ))}
          </div>
        ) : ordersQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar os pedidos.</Alert>
        ) : ordersQuery.orders.length === 0 ? (
          <EmptyState
            title="Nenhum pedido"
            description={
              status ? `Nenhum pedido com status "${formatStatusLabel(status)}".` : 'Os pedidos aparecem aqui assim que chegam.'
            }
          />
        ) : (
          <ul className="admin-rows" aria-label="Pedidos">
            {ordersQuery.orders.map((order) => (
              <AdminOrderRow
                key={order.id}
                order={order}
                isPending={pendingIds.includes(order.id)}
                onAdvance={() => advance(order)}
                onCancel={() => setCancelTarget(order)}
              />
            ))}
          </ul>
        )}

        <LoadMore
          hasNextPage={ordersQuery.hasNextPage}
          isFetchingNextPage={ordersQuery.isFetchingNextPage}
          onLoadMore={() => void ordersQuery.fetchNextPage()}
        />
      </section>

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
