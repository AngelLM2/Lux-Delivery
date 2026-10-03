import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIdempotencyKey } from '../../../shared/hooks/useIdempotencyKey'
import { getApiErrorMessage, getFieldErrors } from '../../../shared/lib/errors'
import { formatCurrency } from '../../../shared/lib/formatters'
import { toast, useUiStore } from '../../../shared/stores/ui.store'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { InputField, TextareaField } from '../../../shared/ui/Input'
import { useAuthStore } from '../../auth/store'
import { useCreateOrder } from '../../orders/hooks'
import { MAX_ITEM_QUANTITY, selectCartTotal, useCartStore } from '../store'

const MIN_ADDRESS_LENGTH = 5

export const CartDrawer = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isOpen = useUiStore((state) => state.isCartOpen)
  const closeCart = useUiStore((state) => state.closeCart)
  const items = useCartStore((state) => state.items)
  const total = useCartStore(selectCartTotal)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const createOrder = useCreateOrder()

  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const lines = items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
  const payload = { delivery_address: address.trim(), notes: notes.trim() || null, items: lines }

  // One key per checkout attempt; a different body gets a new key (the API would answer 422).
  const idempotency = useIdempotencyKey([payload])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeCart])

  const canSubmit = items.length > 0 && payload.delivery_address.length >= MIN_ADDRESS_LENGTH

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || createOrder.isPending) return
    setError(null)
    setFieldErrors({})
    try {
      const { order, replayed } = await createOrder.mutateAsync({
        payload,
        idempotencyKey: idempotency.getKey(),
      })
      idempotency.reset()
      clear()
      setAddress('')
      setNotes('')
      toast.success(replayed ? `Pedido #${order.id} já estava registrado.` : `Pedido #${order.id} realizado!`)
      closeCart()
      navigate(`/orders/${order.id}`)
    } catch (submitError) {
      // The key is kept: retrying the same cart can never create a second order.
      setFieldErrors(getFieldErrors(submitError))
      setError(getApiErrorMessage(submitError))
    }
  }

  const goToLogin = () => {
    closeCart()
    navigate('/login', { state: { from: location.pathname } })
  }

  return (
    <>
      {isOpen && <div className="drawer-overlay" onClick={closeCart} aria-hidden="true" />}
      {/* `.drawer` is visibility:hidden while closed, which also keeps it out of the tab order. */}
      <aside className={`drawer ${isOpen ? 'open' : ''}`} aria-label="Carrinho">
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 className="h3" style={{ margin: 0 }}>Seu pedido</h3>
          <Button variant="ghost" size="sm" onClick={closeCart} aria-label="Fechar carrinho">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>

        <form
          id="checkout-form"
          onSubmit={handleSubmit}
          style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', display: 'grid', gap: '1rem', alignContent: 'start' }}
          noValidate
        >
          {items.length === 0 ? (
            <p className="body-text">Seu carrinho está vazio.</p>
          ) : (
            <>
              {items.map((item) => (
                <div key={item.product_id} className="cart-line">
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{item.name}</strong>
                    <span className="caption">
                      {formatCurrency(item.price)} · subtotal {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      min={1}
                      max={MAX_ITEM_QUANTITY}
                      value={item.quantity}
                      onChange={(event) => updateQuantity(item.product_id, Number(event.target.value))}
                      style={{ width: 70, textAlign: 'center' }}
                      aria-label={`Quantidade de ${item.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.product_id)}
                      aria-label={`Remover ${item.name}`}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
              <InputField
                label="Endereço de entrega"
                autoComplete="street-address"
                value={address}
                maxLength={255}
                onChange={(event) => setAddress(event.target.value)}
                error={
                  fieldErrors.delivery_address ??
                  (address && payload.delivery_address.length < MIN_ADDRESS_LENGTH
                    ? `Informe pelo menos ${MIN_ADDRESS_LENGTH} caracteres.`
                    : undefined)
                }
              />
              <TextareaField
                label="Observações (opcional)"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                error={fieldErrors.notes}
              />
            </>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {!isAuthenticated && items.length > 0 && (
            <p className="caption">Entre na sua conta para finalizar o pedido.</p>
          )}
        </form>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span className="label">Total</span>
            <strong className="price-text">{formatCurrency(total)}</strong>
          </div>
          {isAuthenticated ? (
            <Button
              variant="primary"
              type="submit"
              form="checkout-form"
              isLoading={createOrder.isPending}
              disabled={!canSubmit}
              style={{ width: '100%' }}
            >
              {error ? 'Tentar novamente' : 'Finalizar pedido'}
            </Button>
          ) : (
            <Button variant="primary" onClick={goToLogin} disabled={items.length === 0} style={{ width: '100%' }}>
              Entrar para finalizar
            </Button>
          )}
        </div>
      </aside>
    </>
  )
}
