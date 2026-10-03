import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTER_FUTURE } from '../../../app/router'
import { useUiStore } from '../../../shared/stores/ui.store'
import { makeApiError, makeOrder, makeUser } from '../../../test/fixtures'
import { useAuthStore } from '../../auth/store'
import { ordersApi } from '../../orders/api'
import { useCartStore } from '../store'
import { CartDrawer } from './CartDrawer'

vi.mock('../../orders/api', () => ({ ordersApi: { create: vi.fn() } }))

const create = vi.mocked(ordersApi.create)
const serverDown = () =>
  makeApiError(503, { detail: 'Indisponivel.', code: 'service_unavailable', request_id: 'abc12345-0000' })

const renderCheckout = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>
      <MemoryRouter initialEntries={['/menu']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/menu" element={<CartDrawer />} />
          <Route path="/orders/:id" element={<p>Detalhe do pedido</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const submitWithAddress = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Endereço de entrega'), 'Rua das Flores, 123')
  await user.click(screen.getByRole('button', { name: 'Finalizar pedido' }))
}

describe('CartDrawer checkout', () => {
  beforeEach(() => {
    create.mockReset()
    useAuthStore.setState({ status: 'authenticated', user: makeUser() })
    useUiStore.setState({ isCartOpen: true, toasts: [] })
    useCartStore.setState({ items: [{ product_id: 1, name: 'Risoto', price: 58.9, quantity: 2 }] })
  })

  it('retries with the same Idempotency-Key, so a retry can never duplicate the order', async () => {
    create.mockRejectedValueOnce(serverDown()).mockResolvedValueOnce({ order: makeOrder({ id: 77 }), replayed: true })
    const user = userEvent.setup()
    renderCheckout()

    await submitWithAddress(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno (ref: abc12345)')

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Detalhe do pedido')).toBeInTheDocument()

    expect(create).toHaveBeenCalledTimes(2)
    const [[firstPayload, firstKey], [, secondKey]] = create.mock.calls
    expect(firstKey).toBe(secondKey)
    expect(firstPayload).toEqual({
      delivery_address: 'Rua das Flores, 123',
      notes: null,
      items: [{ product_id: 1, quantity: 2 }],
    })
    // A replay (200 + Idempotent-Replayed) is still a success: the cart is emptied.
    expect(useCartStore.getState().items).toEqual([])
  })

  it('uses a new key once the cart content changes (it is a different order)', async () => {
    create.mockRejectedValue(serverDown())
    const user = userEvent.setup()
    renderCheckout()

    await submitWithAddress(user)
    await screen.findByRole('alert')

    act(() => useCartStore.getState().updateQuantity(1, 3))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))

    const [[, firstKey], [secondPayload, secondKey]] = create.mock.calls
    expect(secondKey).not.toBe(firstKey)
    expect(secondPayload.items).toEqual([{ product_id: 1, quantity: 3 }])
  })
})
