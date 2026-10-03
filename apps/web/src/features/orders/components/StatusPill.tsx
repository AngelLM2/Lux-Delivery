import type { OrderStatus } from '../../../shared/api/types'
import { formatStatusLabel } from '../../../shared/lib/formatters'

export const StatusPill = ({ status }: { status: OrderStatus }) => (
  <span className={`status-pill ${status}`}>{formatStatusLabel(status)}</span>
)
