import { useState } from 'react'
import { useCartStore } from '../../stores/cart.store'
import { useUiStore } from '../../stores/ui.store'
import { useOrders } from '../../hooks/useOrders'
import { formatCurrency } from '../../utils/formatters'
import { Button } from '../ui/Button'
import { InputField, TextareaField } from '../ui/Input'
import { useAuthStore } from '../../stores/auth.store'

export const CartDrawer = () => {
  const isOpen = useUiStore((state) => state.isCartOpen)
  const closeCart = useUiStore((state) => state.closeCart)
  const items = useCartStore((state) => state.items)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const clear = useCartStore((state) => state.clear)
  const user = useAuthStore((state) => state.user)
  const { createOrder } = useOrders(false)
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const handleSubmit = async () => {
    if (!user) {
      closeCart()
      window.location.assign('/login')
      return
    }
    if (!address.trim()) return
    setLoading(true)
    try {
      await createOrder({
        delivery_address: address,
        notes: notes || undefined,
        items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      })
      clear()
      setAddress('')
      setNotes('')
      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        closeCart()
      }, 1400)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {isOpen && <div className="drawer-overlay" onClick={closeCart} />}
      <div className={`drawer ${isOpen ? 'open' : ''}`}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 className="h3" style={{ margin: 0 }}>Your order</h3>
          <Button variant="ghost" size="sm" onClick={closeCart}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>

        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', display: 'grid', gap: '1rem', alignContent: 'start' }}>
          {items.length === 0 ? (
            <p className="body-text">Your cart is empty.</p>
          ) : (
            <>
              {items.map((item) => (
                <div
                  key={item.product_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid var(--color-line)',
                    background: 'var(--color-surface-soft)',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{item.name}</strong>
                    <span className="caption">{formatCurrency(item.price)}</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(event) => updateQuantity(item.product_id, Number(event.target.value))}
                    style={{ width: 70, textAlign: 'center' }}
                    aria-label={`Quantity for ${item.name}`}
                  />
                </div>
              ))}
              <InputField
                label="Delivery address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <TextareaField
                label="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          )}
          {!user && (
            <p className="caption">Sign in to place your order.</p>
          )}
        </div>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span className="label">Total</span>
            <strong className="price-text">{formatCurrency(total)}</strong>
          </div>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={loading}
            isSuccess={showSuccess}
            disabled={items.length === 0 || !address.trim()}
            style={{ width: '100%' }}
          >
            Place order
          </Button>
        </div>
      </div>
    </>
  )
}
