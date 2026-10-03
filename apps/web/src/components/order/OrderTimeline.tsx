import type { TrackingEventRead } from '../../api/types'
import { formatRelativeDate, formatStatusLabel } from '../../utils/formatters'

export const OrderTimeline = ({ events }: { events: TrackingEventRead[] }) => {
  return (
    <div className="timeline">
      {events.map((event, index) => (
        <div
          key={event.id}
          className={`timeline-item ${index === 0 ? 'active' : ''}`}
          style={{
            opacity: 0,
            animation: `fadeUp 0.5s ease ${index * 0.08}s forwards`,
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-ink)' }}>
              {event.description || formatStatusLabel(event.status)}
            </strong>
          </div>
          <span className="caption">{formatRelativeDate(event.created_at)}</span>
        </div>
      ))}
    </div>
  )
}
