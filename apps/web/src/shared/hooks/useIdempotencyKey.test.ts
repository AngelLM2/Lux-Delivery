import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createUuid, useIdempotencyKey } from './useIdempotencyKey'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('useIdempotencyKey', () => {
  const cart = [{ product_id: 1, quantity: 2 }]

  it('reuses the same key for retries of the same request, across re-renders', () => {
    const { result, rerender } = renderHook(({ deps }) => useIdempotencyKey(deps), {
      initialProps: { deps: [cart] as unknown[] },
    })
    const first = result.current.getKey()
    expect(first).toMatch(UUID_V4)
    expect(result.current.getKey()).toBe(first)

    // A new array with the same content is still the same request.
    rerender({ deps: [[{ product_id: 1, quantity: 2 }]] })
    expect(result.current.getKey()).toBe(first)
  })

  it('generates a new key when the request content changes', () => {
    const { result, rerender } = renderHook(({ deps }) => useIdempotencyKey(deps), {
      initialProps: { deps: [cart] as unknown[] },
    })
    const first = result.current.getKey()

    rerender({ deps: [[{ product_id: 1, quantity: 3 }]] })
    const second = result.current.getKey()
    expect(second).not.toBe(first)
    expect(result.current.getKey()).toBe(second)
  })

  it('generates a new key after reset (request succeeded)', () => {
    const { result } = renderHook(() => useIdempotencyKey([cart]))
    const first = result.current.getKey()
    act(() => result.current.reset())
    expect(result.current.getKey()).not.toBe(first)
  })

  it('creates RFC 4122 v4 ids even without crypto.randomUUID (non-secure contexts)', () => {
    const original = crypto.randomUUID
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
      expect(createUuid()).toMatch(UUID_V4)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
