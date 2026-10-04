import type { TrackingEventRead } from '../../../shared/api/types'
import { formatDateTime, formatRelativeDate, formatStatusLabel } from '../../../shared/lib/formatters'

/** Most recent event first; the first item is highlighted as the current step. */
export const OrderTimeline = ({ events }: { events: TrackingEventRead[] }) => {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return (
    <ol className="timeline">
      {sorted.map((event, index) => (
        <li key={event.id} className={`timeline-item ${index === 0 ? 'active' : ''}`}>
          <div className="timeline-item-head">
            <strong>{formatStatusLabel(event.status)}</strong>
            <time className="caption" dateTime={event.created_at} title={formatDateTime(event.created_at)}>
              {formatRelativeDate(event.created_at)}
            </time>
          </div>
          {event.description && <span className="timeline-item-text">{event.description}</span>}
        </li>
      ))}
    </ol>
  )
}
