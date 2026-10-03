import type { OrderStatus } from '../../api/types'
import { formatStatusLabel } from '../../utils/formatters'

export const StatusPill = ({ status }: { status: OrderStatus }) => {
  return <span className={`status-pill ${status}`}>{formatStatusLabel(status)}</span>
}
