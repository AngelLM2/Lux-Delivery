import type { TrackingEventRead } from '../../../shared/api/types'
import { formatDateTime, formatRelativeDate, formatStatusLabel } from '../../../shared/lib/formatters'

/** Most recent event first; the first item is highlighted as the current step. */
export const OrderTimeline = ({ events }: { events: TrackingEventRead[] }) => {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return (
    <ol className="timeline" style={{ listStyle: 'none', margin: 0 }}>
      {sorted.map((event, index) => (
        <li
          key={event.id}
          className={`timeline-item ${index === 0 ? 'active' : ''}`}
          style={{ opacity: 0, animation: `fadeUp 0.5s ease ${index * 0.08}s forwards` }}
        >
          <strong style={{ color: 'var(--color-ink)' }}>{formatStatusLabel(event.status)}</strong>
          {event.description && <span className="body-text">{event.description}</span>}
          <time className="caption" dateTime={event.created_at} title={formatDateTime(event.created_at)}>
            {formatRelativeDate(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  )
}
