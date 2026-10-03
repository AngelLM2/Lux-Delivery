import { useState } from 'react'
import { useAnalytics } from '../../../hooks/useAnalytics'
import { KPICard } from '../../../components/analytics/KPICard'
import { StatusChart } from '../../../components/analytics/StatusChart'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { InputField } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { Alert } from '../../../components/ui/Alert'
import { getApiErrorMessage } from '../../../utils/errors'

export const AdminDashboardPage = () => {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const hasInvalidDateRange = !!startDate && !!endDate && startDate > endDate
  const { data, isLoading, isFetching, isError, error, refetch } = useAnalytics(
    startDate || undefined,
    endDate || undefined,
    !hasInvalidDateRange,
  )

  usePageMeta('Admin Dashboard - Lux Delivery')

  const showLoadingState = isLoading && !data && !hasInvalidDateRange
  const showErrorState = isError && !data && !hasInvalidDateRange

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <header>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Overview</p>
        <h2 className="h1" style={{ margin: 0 }}>Dashboard</h2>
      </header>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ maxWidth: 180 }}>
          <InputField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div style={{ maxWidth: 180 }}>
          <InputField
            label="End date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          isLoading={isFetching}
          disabled={hasInvalidDateRange}
        >
          Refresh
        </Button>
      </div>

      {hasInvalidDateRange && (
        <Alert tone="warning">Start date cannot be after end date.</Alert>
      )}

      {showLoadingState && <p className="body-text">Loading analytics...</p>}

      {showErrorState && (
        <Alert tone="danger">
          {getApiErrorMessage(error) || 'Unable to load dashboard analytics right now.'}
        </Alert>
      )}

      {!showLoadingState && !showErrorState && !data && !hasInvalidDateRange && (
        <p className="body-text">No data available for the selected period.</p>
      )}

      {data && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <KPICard label="Total orders" value={data.total_orders} />
            <KPICard label="Delivered" value={data.delivered_orders} />
            <KPICard label="Canceled" value={data.canceled_orders} />
            <KPICard label="Time to confirm" value={`${data.avg_minutes_to_confirm ?? 0} min`} />
            <KPICard label="Time to dispatch" value={`${data.avg_minutes_to_dispatch ?? 0} min`} />
            <KPICard label="Time to deliver" value={`${data.avg_minutes_to_deliver ?? 0} min`} />
          </div>

          <div className="card">
            <h3 className="h3" style={{ margin: 0 }}>Order status breakdown</h3>
            <StatusChart data={data} />
          </div>
        </>
      )}
    </div>
  )
}
