import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OrderStatus } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Modal } from '../../../shared/ui/Modal'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { OrderCard } from '../components/OrderCard'
import { useOrderList, usePendingStatusChanges, useUpdateOrderStatus } from '../hooks'
import { canCustomerCancel } from '../status'

const TABS: Array<{ label: string; status: OrderStatus | null; empty: string }> = [
  { label: 'Todos', status: null, empty: 'Seus pedidos aparecerão aqui.' },
  { label: 'Entregues', status: 'delivered', empty: 'Nenhum pedido entregue ainda.' },
  { label: 'Cancelados', status: 'canceled', empty: 'Nenhum pedido cancelado.' },
]

export const OrdersPage = () => {
  const navigate = useNavigate()
  const [tabIndex, setTabIndex] = useState(0)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const tab = TABS[tabIndex]

  // `mine: true` matters for admins, who would otherwise see every order here.
  const ordersQuery = useOrderList({ status: tab.status, mine: true })
  const updateStatus = useUpdateOrderStatus()
  const pendingIds = usePendingStatusChanges()

  usePageMeta('Meus pedidos')

  const handleCancel = () => {
    if (cancelId === null) return
    // Errors (e.g. the kitchen already started) are toasted by the mutation hook.
    updateStatus.mutate(
      { id: cancelId, status: 'canceled', description: 'Cancelado pelo cliente.' },
      { onSettled: () => setCancelId(null) },
    )
  }

  return (
    <div className="container page">
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Acompanhe suas entregas</p>
        <h1 className="h1" style={{ margin: 0 }}>Meus pedidos</h1>
      </header>

      <div className="filter-pills" role="group" aria-label="Filtrar pedidos" style={{ marginBottom: '1.5rem' }}>
        {TABS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={index === tabIndex}
            className={`filter-pill ${index === tabIndex ? 'active' : ''}`}
            onClick={() => setTabIndex(index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {ordersQuery.isPending ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} height={180} />)
        ) : ordersQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar seus pedidos.</Alert>
        ) : ordersQuery.orders.length === 0 ? (
          <EmptyState
            title="Nenhum pedido por aqui"
            description={tab.empty}
            action={
              <Button variant="outline" onClick={() => navigate('/menu')}>
                Ver cardápio
              </Button>
            }
          />
        ) : (
          ordersQuery.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onView={() => navigate(`/orders/${order.id}`)}
              canCancel={canCustomerCancel(order.status)}
              isCanceling={pendingIds.includes(order.id)}
              onCancel={() => setCancelId(order.id)}
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
        isOpen={cancelId !== null}
        title="Cancelar este pedido?"
        description="Esta ação não pode ser desfeita."
        onClose={() => setCancelId(null)}
        onConfirm={handleCancel}
        confirmLabel="Cancelar pedido"
        confirmVariant="danger"
        isConfirming={updateStatus.isPending}
      />
    </div>
  )
}
