import { ArrowRight, ShoppingBag } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../../shared/lib/formatters'
import { useUiStore } from '../../../shared/stores/ui.store'
import { selectCartCount, selectCartTotal, useCartStore } from '../store'

/** Floating "Ver carrinho" bar on the menu, so the cart is within reach while choosing dishes. */
export const CartBar = () => {
  const count = useCartStore(selectCartCount)
  const total = useCartStore(selectCartTotal)
  const isCartOpen = useUiStore((state) => state.isCartOpen)
  const openCart = useUiStore((state) => state.openCart)
  const visible = count > 0 && !isCartOpen

  // Lets toasts and the page bottom make room for the bar.
  useEffect(() => {
    document.body.classList.toggle('has-cart-bar', visible)
    return () => document.body.classList.remove('has-cart-bar')
  }, [visible])

  if (count === 0) return null

  const items = `${count} ${count === 1 ? 'item' : 'itens'}`

  // Portal: the page sits inside an animated (transformed) wrapper, which would break `position: fixed`.
  return createPortal(
    <div className={`cart-bar ${visible ? 'is-visible' : ''}`}>
      <button type="button" className="cart-bar-button" onClick={openCart} aria-label={`Ver carrinho: ${items}, ${formatCurrency(total)}`}>
        <span className="cart-bar-icon" aria-hidden="true">
          <ShoppingBag size={18} strokeWidth={1.75} />
          {/* Keyed by count: remounting replays the "bump" animation on every change. */}
          <span key={count} className="cart-bar-count">
            {count}
          </span>
        </span>
        <span className="cart-bar-label">Ver carrinho</span>
        <span className="cart-bar-total">{formatCurrency(total)}</span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <span className="sr-only" aria-live="polite">
        {items} no carrinho
      </span>
    </div>,
    document.body,
  )
}
