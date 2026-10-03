import type { OrdersAnalytics } from '../../../shared/api/types'
import { formatMinutes } from '../../../shared/lib/formatters'

const STAGES = [
  { key: 'minutes_to_confirm', label: 'Confirmação' },
  { key: 'minutes_to_dispatch', label: 'Saída para entrega' },
  { key: 'minutes_to_deliver', label: 'Entrega' },
  { key: 'minutes_end_to_end', label: 'Total (ponta a ponta)' },
] as const

/** Time spent in each stage of the order flow: average and percentiles. */
export const DurationTable = ({ analytics }: { analytics: OrdersAnalytics }) => (
  <table className="data-table">
    <thead>
      <tr>
        <th scope="col">Etapa</th>
        <th scope="col" className="numeric">Média</th>
        <th scope="col" className="numeric">p50</th>
        <th scope="col" className="numeric">p90</th>
      </tr>
    </thead>
    <tbody>
      {STAGES.map(({ key, label }) => {
        const stats = analytics[key]
        return (
          <tr key={key}>
            <th scope="row">{label}</th>
            <td className="numeric">{formatMinutes(stats.avg)}</td>
            <td className="numeric">{formatMinutes(stats.p50)}</td>
            <td className="numeric">{formatMinutes(stats.p90)}</td>
          </tr>
        )
      })}
    </tbody>
  </table>
)
