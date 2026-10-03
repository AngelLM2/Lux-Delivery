import { describe, expect, it } from 'vitest'
import { makeApiError } from '../../test/fixtures'
import { canCustomerCancel, describeStatusChangeError, getNextStatus, summarizeItems } from './status'

const item = (id: number, name: string, quantity: number) => ({
  id,
  product_id: id,
  product_name: name,
  quantity,
  unit_price: 10,
  total_price: 10 * quantity,
})

describe('order status helpers', () => {
  it('walks the flow created -> confirmed -> preparing -> out_for_delivery -> delivered', () => {
    expect(getNextStatus('created')).toBe('confirmed')
    expect(getNextStatus('confirmed')).toBe('preparing')
    expect(getNextStatus('preparing')).toBe('out_for_delivery')
    expect(getNextStatus('out_for_delivery')).toBe('delivered')
    expect(getNextStatus('delivered')).toBeNull()
    expect(getNextStatus('canceled')).toBeNull()
  })

  it('lets customers cancel only before the kitchen starts', () => {
    expect(canCustomerCancel('created')).toBe(true)
    expect(canCustomerCancel('confirmed')).toBe(true)
    expect(canCustomerCancel('preparing')).toBe(false)
    expect(canCustomerCancel('delivered')).toBe(false)
  })

  it('turns a 409 invalid_transition into a friendly message', () => {
    const conflict = makeApiError(409, { detail: 'Transicao invalida.', code: 'invalid_transition', request_id: 'r' })
    expect(describeStatusChangeError(conflict)).toBe(
      'Este pedido já foi atualizado por outra pessoa. A lista foi recarregada.',
    )
  })

  it('summarizes items by product name', () => {
    expect(summarizeItems({ items: [item(1, 'Risoto', 2), item(2, 'Vinho', 1)] })).toBe('2x Risoto, 1x Vinho')
    expect(summarizeItems({ items: [item(1, 'A', 1), item(2, 'B', 1), item(3, 'C', 1), item(4, 'D', 1)] }, 2)).toBe(
      '1x A, 1x B e mais 2',
    )
  })
})
