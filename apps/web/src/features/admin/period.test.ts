import { describe, expect, it } from 'vitest'
import { getPeriodRange } from './period'

describe('getPeriodRange', () => {
  it('returns the last N local calendar days, today included, across month boundaries', () => {
    const today = new Date(2026, 9, 3, 0, 30) // 03/10/2026 00:30, local time
    expect(getPeriodRange(7, today)).toEqual({ start_date: '2026-09-27', end_date: '2026-10-03' })
    expect(getPeriodRange(1, today)).toEqual({ start_date: '2026-10-03', end_date: '2026-10-03' })
  })
})
