import type { OrderStatus } from '../api/types'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatDateTime = (iso?: string | null) => {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return dateTimeFormatter.format(date)
}

export const formatRelativeDate = (iso?: string | null) => {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const diffMs = date.getTime() - Date.now()
  const diffSeconds = Math.round(diffMs / 1000)
  const absSeconds = Math.abs(diffSeconds)

  if (absSeconds < 60) return relativeFormatter.format(diffSeconds, 'second')

  const diffMinutes = Math.round(diffSeconds / 60)
  const absMinutes = Math.abs(diffMinutes)
  if (absMinutes < 60) return relativeFormatter.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMinutes / 60)
  const absHours = Math.abs(diffHours)
  if (absHours < 24) return relativeFormatter.format(diffHours, 'hour')

  const diffDays = Math.round(diffHours / 24)
  const absDays = Math.abs(diffDays)
  if (absDays < 30) return relativeFormatter.format(diffDays, 'day')

  const diffMonths = Math.round(diffDays / 30)
  const absMonths = Math.abs(diffMonths)
  if (absMonths < 12) return relativeFormatter.format(diffMonths, 'month')

  const diffYears = Math.round(diffDays / 365)
  return relativeFormatter.format(diffYears, 'year')
}

export const formatStatusLabel = (status: OrderStatus) => {
  switch (status) {
    case 'created':
      return 'Order placed'
    case 'confirmed':
      return 'Order confirmed'
    case 'preparing':
      return 'In the kitchen'
    case 'out_for_delivery':
      return 'Out for delivery'
    case 'delivered':
      return 'Delivered'
    case 'canceled':
      return 'Canceled'
    default:
      return status
  }
}

export const clampText = (value: string, max = 120) => {
  if (value.length <= max) return value
  return `${value.slice(0, max).trim()}...`
}
