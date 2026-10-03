import { describe, expect, it } from 'vitest'
import { computeBackoff } from './backoff'

describe('computeBackoff', () => {
  it('doubles from 1s and caps at 30s', () => {
    const noJitter = { random: () => 0.5 }
    expect([0, 1, 2, 3, 4, 5, 6].map((attempt) => computeBackoff(attempt, noJitter))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ])
  })

  it('applies +-20% jitter without ever exceeding the cap', () => {
    expect(computeBackoff(0, { random: () => 0 })).toBe(800)
    expect(computeBackoff(0, { random: () => 1 })).toBe(1200)
    expect(computeBackoff(10, { random: () => 1 })).toBe(30000)
  })
})
