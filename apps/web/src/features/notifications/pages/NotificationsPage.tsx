import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { formatDateTime, formatRelativeDate } from '../../../shared/lib/formatters'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Skeleton } from '../../../shared/ui/Skeleton'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadCount,
} from '../hooks'

export const NotificationsPage = () => {
  const [onlyUnread, setOnlyUnread] = useState(false)
  const listQuery = useNotificationList(onlyUnread)
  const { data: unread = 0 } = useUnreadCount(true)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  usePageMeta('Notificações')

  return (
    <div className="container page">
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
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Fique por dentro</p>
          <h1 className="h1" style={{ margin: 0 }}>Notificações</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllRead.mutate()}
          isLoading={markAllRead.isPending}
          disabled={unread === 0}
        >
          Marcar todas como lidas
        </Button>
      </header>

      <div className="filter-pills" role="group" aria-label="Filtrar notificações" style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          aria-pressed={!onlyUnread}
          className={`filter-pill ${!onlyUnread ? 'active' : ''}`}
          onClick={() => setOnlyUnread(false)}
        >
          Todas
        </button>
        <button
          type="button"
          aria-pressed={onlyUnread}
          className={`filter-pill ${onlyUnread ? 'active' : ''}`}
          onClick={() => setOnlyUnread(true)}
        >
          Não lidas{unread > 0 ? ` (${unread})` : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {listQuery.isPending ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={84} />)
        ) : listQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar suas notificações.</Alert>
        ) : listQuery.notifications.length === 0 ? (
          <EmptyState
            title={onlyUnread ? 'Tudo em dia' : 'Nenhuma notificação'}
            description={
              onlyUnread ? 'Você não tem notificações não lidas.' : 'Avisaremos você a cada etapa do seu pedido.'
            }
          />
        ) : (
          listQuery.notifications.map((notification) => (
            <div
              key={notification.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                background: notification.is_read ? 'var(--color-surface)' : 'var(--color-surface-soft)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="h3" style={{ margin: 0, marginBottom: '0.25rem' }}>{notification.message}</h3>
                <p className="caption" style={{ margin: 0 }}>
                  {notification.order_id != null && (
                    <>
                      <Link to={`/orders/${notification.order_id}`} style={{ color: 'var(--color-ink)' }}>
                        Pedido #{notification.order_id}
                      </Link>
                      {' • '}
                    </>
                  )}
                  <time dateTime={notification.created_at} title={formatDateTime(notification.created_at)}>
                    {formatRelativeDate(notification.created_at)}
                  </time>
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                {notification.is_read ? (
                  <Badge tone="success">Lida</Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => markRead.mutate(notification.id)}>
                    Marcar como lida
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <LoadMore
        hasNextPage={listQuery.hasNextPage}
        isFetchingNextPage={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
      />
    </div>
  )
}
