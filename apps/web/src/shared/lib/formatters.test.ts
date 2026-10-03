import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatMinutes,
  formatPercent,
  formatRelativeDate,
  formatShortDate,
  formatStatusLabel,
  toIsoDay,
} from './formatters'

/** Intl uses non-breaking spaces; normalise them for readable assertions. */
const plain = (value: string) => value.replace(/\s/g, ' ')

describe('formatters', () => {
  it('formats BRL currency, including decimal strings and missing values', () => {
    expect(plain(formatCurrency(1234.5))).toBe('R$ 1.234,50')
    expect(plain(formatCurrency('89.9'))).toBe('R$ 89,90')
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency('abc')).toBe('—')
  })

  it('translates every order status to pt-BR and passes unknown values through', () => {
    expect(formatStatusLabel('created')).toBe('Recebido')
    expect(formatStatusLabel('preparing')).toBe('Em preparo')
    expect(formatStatusLabel('out_for_delivery')).toBe('Saiu para entrega')
    expect(formatStatusLabel('delivered')).toBe('Entregue')
    expect(formatStatusLabel('canceled')).toBe('Cancelado')
    expect(formatStatusLabel('refunded')).toBe('refunded')
  })

  it('formats relative dates in pt-BR against an injected "now"', () => {
    const now = Date.parse('2026-10-03T12:00:00Z')
    expect(formatRelativeDate('2026-10-03T11:55:00Z', now)).toBe('há 5 minutos')
    expect(formatRelativeDate('2026-10-02T12:00:00Z', now)).toBe('ontem')
    expect(formatRelativeDate('2026-10-03T14:00:00Z', now)).toBe('em 2 horas')
    expect(formatRelativeDate(null, now)).toBe('—')
    expect(formatRelativeDate('not-a-date', now)).toBe('not-a-date')
  })

  it('formats durations in minutes and hours', () => {
    expect(formatMinutes(42.4)).toBe('42 min')
    expect(formatMinutes(95)).toBe('1 h 35 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(null)).toBe('—')
  })

  it('formats rates as percentages', () => {
    expect(plain(formatPercent(0.125))).toBe('12,5%')
  })

  it('handles calendar days without shifting time zones', () => {
    expect(formatShortDate('2026-10-03')).toBe('03/10')
    expect(toIsoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
