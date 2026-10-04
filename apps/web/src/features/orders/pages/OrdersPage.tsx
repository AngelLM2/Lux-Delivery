import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { OrderStatus } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { Alert } from '../../../shared/ui/Alert'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Modal } from '../../../shared/ui/Modal'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ActiveOrderCard } from '../components/ActiveOrderCard'
import { OrderRow } from '../components/OrderRow'
import { useOrderList, usePendingStatusChanges, useUpdateOrderStatus } from '../hooks'
import { canCustomerCancel, isFinalStatus } from '../status'
import '../orders.css'

const TABS: Array<{ label: string; status: OrderStatus | null; empty: string }> = [
  { label: 'Todos', status: null, empty: 'Quando você fizer um pedido, ele aparece aqui.' },
  { label: 'Entregues', status: 'delivered', empty: 'Nenhum pedido entregue ainda.' },
  { label: 'Cancelados', status: 'canceled', empty: 'Nenhum pedido cancelado.' },
]

export const OrdersPage = () => {
  const [tabIndex, setTabIndex] = useState(0)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const tab = TABS[tabIndex]

  // `mine: true` matters for admins, who would otherwise see every order here.
  const ordersQuery = useOrderList({ status: tab.status, mine: true })
  const updateStatus = useUpdateOrderStatus()
  const pendingIds = usePendingStatusChanges()

  usePageMeta('Meus pedidos')

  const orders = ordersQuery.orders
  // On "Todos", orders still on their way get a card of their own at the top.
  const active = tab.status === null ? orders.filter((order) => !isFinalStatus(order.status)) : []
  const history = tab.status === null ? orders.filter((order) => isFinalStatus(order.status)) : orders

  const handleCancel = () => {
    if (cancelId === null) return
    // Errors (e.g. the kitchen already started) are toasted by the mutation hook.
    updateStatus.mutate(
      { id: cancelId, status: 'canceled', description: 'Cancelado pelo cliente.' },
      { onSettled: () => setCancelId(null) },
    )
  }

  return (
    <div className="container page orders-page">
      <header className="orders-head">
        <h1 className="orders-title">Meus pedidos</h1>
        <div className="text-tabs" role="group" aria-label="Filtrar pedidos">
          {TABS.map((item, index) => (
            <button key={item.label} type="button" aria-pressed={index === tabIndex} onClick={() => setTabIndex(index)}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {ordersQuery.isPending ? (
        <div className="orders-skeleton">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={64} />
          ))}
        </div>
      ) : ordersQuery.isError ? (
        <Alert tone="danger">Não foi possível carregar seus pedidos.</Alert>
      ) : orders.length === 0 ? (
        <EmptyState
          title="Nenhum pedido por aqui"
          description={tab.empty}
          action={
            <Link to="/menu" className="btn btn-outline">
              Ver cardápio
            </Link>
          }
        />
      ) : (
        <>
          {active.length > 0 && (
            <section className="orders-section" aria-labelledby="orders-active">
              <h2 id="orders-active" className="orders-section-title">Em andamento</h2>
              <div className="active-orders">
                {active.map((order) => (
                  <ActiveOrderCard
                    key={order.id}
                    order={order}
                    canCancel={canCustomerCancel(order.status)}
                    isCanceling={pendingIds.includes(order.id)}
                    onCancel={() => setCancelId(order.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section className="orders-section" aria-labelledby="orders-history">
              <h2 id="orders-history" className={active.length > 0 ? 'orders-section-title' : 'sr-only'}>
                {tab.status === null ? 'Anteriores' : tab.label}
              </h2>
              <ul className="order-rows">
                {history.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

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
