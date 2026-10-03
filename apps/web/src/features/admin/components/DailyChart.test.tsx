import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DailyPoint } from '../../../shared/api/types'
import { DailyChart } from './DailyChart'

const data: DailyPoint[] = [
  { day: '2026-10-01', orders: 4, delivered: 3, revenue: 320.5 },
  { day: '2026-10-02', orders: 0, delivered: 0, revenue: 0 },
  { day: '2026-10-03', orders: 9, delivered: 8, revenue: 1290 },
]

describe('DailyChart', () => {
  it('renders one revenue bar per day and an orders line', () => {
    const { container } = render(<DailyChart data={data} />)
    expect(container.querySelectorAll('.daily-chart-bar')).toHaveLength(3)
    expect(container.querySelector('.daily-chart-line')?.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+ L/)
  })

  it('is described for assistive technology and ships a table view', () => {
    render(<DailyChart data={data} />)
    const chart = screen.getByRole('img', { name: /Receita e pedidos por dia/ })
    expect(chart).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Receita e pedidos por dia' })
    expect(within(table).getAllByRole('row')).toHaveLength(data.length + 1)
  })

  it('shows the details of the hovered day', () => {
    const { container } = render(<DailyChart data={data} />)
    const hitTargets = container.querySelectorAll('rect[fill="transparent"]')
    fireEvent.mouseEnter(hitTargets[2])
    expect(screen.getByText(/03\/10 · R\$\s1\.290,00 · 9 pedidos · 8 entregues/)).toBeInTheDocument()
  })

  it('renders an empty state when the period has no data', () => {
    const { container } = render(<DailyChart data={[]} />)
    expect(screen.getByText('Sem pedidos no período selecionado.')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})
