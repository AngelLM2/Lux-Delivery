import type { OrderStatus, UserRole } from '../api/types'

const LOCALE = 'pt-BR'

const currencyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL' })
const compactCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percentFormatter = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const integerFormatter = new Intl.NumberFormat(LOCALE)
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' })
const dayMonthFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' })
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/** Accepts numbers and the decimal strings some payloads carry (e.g. SSE `total_amount`). */
export const formatCurrency = (value: number | string | null | undefined) => {
  const amount = typeof value === 'string' ? Number(value) : value
  if (amount == null || !Number.isFinite(amount)) return '—'
  return currencyFormatter.format(amount)
}

export const formatCompactCurrency = (value: number) => compactCurrencyFormatter.format(value)

/** `0.125` -> `12,5%` (the API sends rates as fractions). */
export const formatPercent = (fraction: number) => percentFormatter.format(fraction)

export const formatNumber = (value: number) => integerFormatter.format(value)

/** `42` -> `42 min`, `95` -> `1 h 35 min`, `null` -> `—`. */
export const formatMinutes = (minutes: number | null | undefined) => {
  if (minutes == null || !Number.isFinite(minutes)) return '—'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')} min`
}

export const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return dateTimeFormatter.format(date)
}

/** `2026-10-03` (a calendar day, no time zone) -> `03/10`. */
export const formatShortDate = (isoDay: string) => {
  const [year, month, day] = isoDay.split('-').map(Number)
  if (!year || !month || !day) return isoDay
  return shortDateFormatter.format(new Date(year, month - 1, day))
}

/** `2026-10-03T21:55:00Z` -> `03 out` (local time). */
export const formatDayMonth = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return dayMonthFormatter.format(date).replace(' de ', ' ').replace('.', '')
}

/** `2026-10-03T21:55:00Z` -> `21:55` (local time). */
export const formatTime = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return timeFormatter.format(date)
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

/** "há 5 minutos", "ontem", "em 2 horas"... `now` is injectable for deterministic tests. */
export const formatRelativeDate = (iso?: string | null, now: number = Date.now()) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  let value = (date.getTime() - now) / 1000
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return relativeFormatter.format(Math.round(value), unit)
    value /= size
  }
  return relativeFormatter.format(Math.round(value), 'year')
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  canceled: 'Cancelado',
}

export const isOrderStatus = (value: string): value is OrderStatus => value in ORDER_STATUS_LABELS

/** Accepts plain strings too (analytics `status_breakdown` is typed as `string`). */
export const formatStatusLabel = (status: OrderStatus | string) =>
  isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status

export const formatRole = (role: UserRole) => (role === 'admin' ? 'Administrador' : 'Cliente')

export const clampText = (value: string, max = 120) => {
  if (value.length <= max) return value
  return `${value.slice(0, max).trim()}...`
}

/** Local calendar day as `YYYY-MM-DD` (never `toISOString()`, which shifts to UTC). */
export const toIsoDay = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
