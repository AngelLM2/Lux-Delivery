import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../features/auth/store'
import { USER_SCOPED_QUERY_ROOTS, createQueryClient } from './queryClient'
import { RealtimeProvider } from './realtime'

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(createQueryClient)

  // Logout / expired session: drop the previous user's data from the cache.
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (previous.user && !state.user) {
          queryClient.removeQueries({
            predicate: (query) => USER_SCOPED_QUERY_ROOTS.has(String(query.queryKey[0])),
          })
        }
      }),
    [queryClient],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  )
}
