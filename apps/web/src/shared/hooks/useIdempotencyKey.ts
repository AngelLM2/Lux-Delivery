import { useCallback, useRef } from 'react'

/** RFC 4122 v4. `crypto.randomUUID` only exists in secure contexts (HTTPS / localhost). */
export const createUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * One idempotency key per operation (e.g. `POST /orders`): retries and double clicks reuse it,
 * a different body (`deps` changed by value) gets a new one, and `reset()` drops it after success.
 */
export const useIdempotencyKey = (deps: readonly unknown[]) => {
  const signature = JSON.stringify(deps)
  const current = useRef<{ signature: string; key: string } | null>(null)

  const getKey = useCallback(() => {
    if (!current.current || current.current.signature !== signature) {
      current.current = { signature, key: createUuid() }
    }
    return current.current.key
  }, [signature])

  const reset = useCallback(() => {
    current.current = null
  }, [])

  return { getKey, reset }
}
