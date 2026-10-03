import { useMemo, useState } from 'react'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { getApiErrorMessage } from '../../../shared/lib/errors'
import {
  formatCompactCurrency,
  formatCurrency,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '../../../shared/lib/formatters'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { DailyChart } from '../components/DailyChart'
import { DurationTable } from '../components/DurationTable'
import { KPICard } from '../components/KPICard'
import { StatusChart } from '../components/StatusChart'
import { TopProductsTable } from '../components/TopProductsTable'
import { useOrdersAnalytics } from '../hooks'
import { PERIOD_OPTIONS, getPeriodRange, type PeriodDays } from '../period'

export const DashboardPage = () => {
  const [days, setDays] = useState<PeriodDays>(30)
  // Computed once per period change, so the query key does not change on every render.
  const range = useMemo(() => getPeriodRange(days), [days])
  const { data, isPending, isFetching, isPlaceholderData, isError, error, refetch } = useOrdersAnalytics(range)

  usePageMeta('Dashboard — Admin')

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <header
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Visão geral</p>
          <h2 className="h1" style={{ margin: 0 }}>Dashboard</h2>
          {data && (
            <p className="caption" style={{ marginTop: '0.25rem' }}>
              {formatShortDate(data.period_start)} a {formatShortDate(data.period_end)} · fuso {data.timezone}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="filter-pills" role="group" aria-label="Período" style={{ paddingBottom: 0 }}>
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`filter-pill ${option === days ? 'active' : ''}`}
                aria-pressed={option === days}
                onClick={() => setDays(option)}
              >
                {option} dias
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refetch()} isLoading={isFetching && !isPending}>
            Atualizar
          </Button>
        </div>
      </header>

      {isError && !data && (
        <Alert tone="danger">{getApiErrorMessage(error, 'Não foi possível carregar os indicadores.')}</Alert>
      )}

      {isPending && (
        <div className="kpi-grid" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={104} />
          ))}
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gap: '1.5rem', opacity: isPlaceholderData ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
          <div className="kpi-grid">
            <KPICard
              label="Pedidos"
              value={formatNumber(data.total_orders)}
              helper={`${formatNumber(data.delivered_orders)} entregues`}
            />
            <KPICard
              label="Receita"
              value={data.revenue >= 100_000 ? formatCompactCurrency(data.revenue) : formatCurrency(data.revenue)}
              helper={`${formatCurrency(data.revenue)} em pedidos entregues`}
            />
            <KPICard
              label="Ticket médio"
              value={formatCurrency(data.average_ticket)}
              helper={data.average_ticket == null ? 'Sem entregas no período' : undefined}
            />
            <KPICard
              label="Taxa de cancelamento"
              value={formatPercent(data.cancel_rate)}
              helper={`${formatNumber(data.canceled_orders)} cancelados`}
            />
            <KPICard
              label="Tempo total (p50)"
              value={formatMinutes(data.minutes_end_to_end.p50)}
              helper={`p90: ${formatMinutes(data.minutes_end_to_end.p90)}`}
            />
          </div>

          <section className="card" aria-labelledby="daily-title">
            <h3 id="daily-title" className="h3" style={{ margin: 0 }}>Receita e pedidos por dia</h3>
            <DailyChart data={data.daily} />
          </section>

          <div className="dashboard-columns">
            <section className="card" aria-labelledby="status-title">
              <h3 id="status-title" className="h3" style={{ margin: 0 }}>Pedidos por status</h3>
              <StatusChart data={data.status_breakdown} />
            </section>
            <section className="card" aria-labelledby="durations-title">
              <h3 id="durations-title" className="h3" style={{ margin: 0 }}>Tempo por etapa</h3>
              <DurationTable analytics={data} />
            </section>
          </div>

          <section className="card" aria-labelledby="top-title">
            <h3 id="top-title" className="h3" style={{ margin: 0 }}>Produtos mais vendidos</h3>
            <TopProductsTable products={data.top_products} />
          </section>
        </div>
      )}
    </div>
  )
}
