import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'

export const useAnalytics = (startDate?: string, endDate?: string, enabled = true) => {
  return useQuery({
    queryKey: ['analytics', startDate, endDate],
    queryFn: () => analyticsApi.ordersProgress(startDate, endDate),
    enabled,
    retry: false,
    retryOnMount: false,
  })
}
