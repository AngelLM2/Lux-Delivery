import { QueryClient } from '@tanstack/react-query'
import { getErrorStatus } from '../shared/lib/errors'

/** Client errors (4xx) will not fix themselves: only network/5xx failures are retried. */
const shouldRetry = (failureCount: number, error: unknown) => {
  const status = getErrorStatus(error)
  if (status !== undefined && status >= 400 && status < 500) return false
  return failureCount < 2
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })

/** Query roots that hold per-user data and must not survive a logout. */
export const USER_SCOPED_QUERY_ROOTS = new Set(['orders', 'notifications', 'analytics', 'users'])
