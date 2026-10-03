import { useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelativeDate } from '../../utils/formatters'
import { usePageMeta } from '../../hooks/usePageMeta'

export const NotificationsPage = () => {
  const [onlyUnread, setOnlyUnread] = useState(false)
  const { notifications, markRead } = useNotifications(onlyUnread)

  usePageMeta('Notifications — Lux Delivery')

  return (
    <div className="container page">
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Stay updated</p>
        <h1 className="h1" style={{ margin: 0 }}>Notifications</h1>
      </header>

      <div className="filter-pills" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`filter-pill ${!onlyUnread ? 'active' : ''}`}
          onClick={() => setOnlyUnread(false)}
        >
          All
        </button>
        <button
          className={`filter-pill ${onlyUnread ? 'active' : ''}`}
          onClick={() => setOnlyUnread(true)}
        >
          Unread
        </button>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="You will be notified at every step."
          />
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                background: notification.is_read
                  ? 'var(--color-surface)'
                  : 'var(--color-surface-soft)',
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 className="h3" style={{ margin: 0, marginBottom: '0.25rem' }}>
                  {notification.message}
                </h3>
                <p className="caption" style={{ margin: 0 }}>
                  Order #{notification.order_id} • {formatRelativeDate(notification.created_at)}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                {notification.is_read ? (
                  <Badge tone="success">Read</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markRead(notification.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
