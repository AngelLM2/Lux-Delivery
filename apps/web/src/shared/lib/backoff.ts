type BackoffOptions = {
  initialMs?: number
  maxMs?: number
  /** Fraction of the delay randomised in both directions (0.2 = ±20%). */
  jitter?: number
  random?: () => number
}

/**
 * Exponential backoff with jitter: 1s, 2s, 4s ... capped at 30s, each +-20%.
 * Jitter keeps many tabs/clients from reconnecting in lockstep after an outage.
 */
export const computeBackoff = (
  attempt: number,
  { initialMs = 1_000, maxMs = 30_000, jitter = 0.2, random = Math.random }: BackoffOptions = {},
) => {
  const base = Math.min(maxMs, initialMs * 2 ** Math.max(0, attempt))
  const spread = base * jitter * (random() * 2 - 1)
  return Math.round(Math.min(maxMs, Math.max(0, base + spread)))
}
