import { CircleSlash, Receipt, RefreshCw, ShoppingBag, Timer, Wallet } from 'lucide-react'
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
import { Skeleton } from '../../../shared/ui/Skeleton'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { DailyChart } from '../components/DailyChart'
import { DurationList } from '../components/DurationList'
import { KPICard } from '../components/KPICard'
import { StatusChart } from '../components/StatusChart'
import { TopProductsList } from '../components/TopProductsList'
import { useOrdersAnalytics } from '../hooks'
import { PERIOD_OPTIONS, getPeriodRange, type PeriodDays } from '../period'

export const DashboardPage = () => {
  const [days, setDays] = useState<PeriodDays>(30)
  // Computed once per period change, so the query key does not change on every render.
  const range = useMemo(() => getPeriodRange(days), [days])
  const { data, isPending, isFetching, isPlaceholderData, isError, error, refetch } = useOrdersAnalytics(range)

  usePageMeta('Dashboard — Admin')

  const refreshing = isFetching && !isPending

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        meta={data ? `${formatShortDate(data.period_start)} a ${formatShortDate(data.period_end)}` : undefined}
        actions={
          <>
            <div className="segmented" role="group" aria-label="Período">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === days ? 'active' : ''}
                  aria-pressed={option === days}
                  onClick={() => setDays(option)}
                >
                  {option} dias
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-action is-bordered"
              onClick={() => void refetch()}
              aria-label="Atualizar indicadores"
              title="Atualizar"
              aria-busy={refreshing || undefined}
            >
              <RefreshCw size={16} className={refreshing ? 'is-spinning' : undefined} aria-hidden="true" />
            </button>
          </>
        }
      />

      {isError && !data && (
        <Alert tone="danger">{getApiErrorMessage(error, 'Não foi possível carregar os indicadores.')}</Alert>
      )}

      {isPending && (
        <div className="kpi-grid" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={104} radius="var(--radius-lg)" />
          ))}
        </div>
      )}

      {data && (
        <div className="admin-page" style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
          <div className="kpi-grid">
            <KPICard
              icon={ShoppingBag}
              label="Pedidos"
              value={formatNumber(data.total_orders)}
              helper={`${formatNumber(data.delivered_orders)} entregues`}
            />
            <KPICard
              icon={Wallet}
              label="Receita"
              value={data.revenue >= 100_000 ? formatCompactCurrency(data.revenue) : formatCurrency(data.revenue)}
              helper="pedidos entregues"
            />
            <KPICard icon={Receipt} label="Ticket médio" value={formatCurrency(data.average_ticket)} />
            <KPICard
              icon={CircleSlash}
              label="Cancelamento"
              value={formatPercent(data.cancel_rate)}
              helper={`${formatNumber(data.canceled_orders)} pedidos`}
            />
            <KPICard
              icon={Timer}
              label="Tempo de entrega"
              value={formatMinutes(data.minutes_end_to_end.p50)}
              helper="mediana, do pedido à entrega"
            />
          </div>

          <section className="card admin-card" aria-labelledby="daily-title">
            <h2 id="daily-title" className="h3">Receita e pedidos por dia</h2>
            <DailyChart data={data.daily} />
          </section>

          <div className="dashboard-columns">
            <section className="card admin-card" aria-labelledby="status-title">
              <h2 id="status-title" className="h3">Por status</h2>
              <StatusChart data={data.status_breakdown} />
            </section>
            <section className="card admin-card" aria-labelledby="durations-title">
              <h2 id="durations-title" className="h3">Tempo por etapa</h2>
              <DurationList analytics={data} />
            </section>
            <section className="card admin-card" aria-labelledby="top-title">
              <h2 id="top-title" className="h3">Mais vendidos</h2>
              <TopProductsList products={data.top_products} />
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
