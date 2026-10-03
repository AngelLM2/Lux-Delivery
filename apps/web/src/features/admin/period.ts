import type { OrdersAnalyticsParams } from '../../shared/api/types'
import { toIsoDay } from '../../shared/lib/formatters'

export const PERIOD_OPTIONS = [7, 30, 90] as const
export type PeriodDays = (typeof PERIOD_OPTIONS)[number]

/** Last `days` calendar days, today included, in the browser's local time zone. */
export const getPeriodRange = (days: number, today: Date = new Date()): Required<OrdersAnalyticsParams> => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
  return { start_date: toIsoDay(start), end_date: toIsoDay(today) }
}
