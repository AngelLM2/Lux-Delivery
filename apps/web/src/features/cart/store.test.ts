import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_ITEM_QUANTITY, selectCartCount, selectCartTotal, useCartStore } from './store'

const risotto = { product_id: 1, name: 'Risoto de cogumelos', price: 58.9 }
const wine = { product_id: 2, name: 'Vinho tinto', price: 120 }

const cart = () => useCartStore.getState()

describe('cart store', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
  })

  it('adds a new item with quantity 1 by default', () => {
    cart().addItem(risotto)
    expect(cart().items).toEqual([{ ...risotto, quantity: 1 }])
  })

  it('merges repeated products into one line instead of duplicating it', () => {
    cart().addItem(risotto)
    cart().addItem(risotto, 2)
    expect(cart().items).toHaveLength(1)
    expect(cart().items[0].quantity).toBe(3)
  })

  it('updates the quantity and removes the line when it reaches zero', () => {
    cart().addItem(risotto)
    cart().addItem(wine)
    cart().updateQuantity(1, 4)
    expect(cart().items.find((item) => item.product_id === 1)?.quantity).toBe(4)

    cart().updateQuantity(1, 0)
    expect(cart().items.map((item) => item.product_id)).toEqual([2])
  })

  it('caps quantities at the API limit and ignores invalid input', () => {
    cart().addItem(risotto, 70)
    expect(cart().items[0].quantity).toBe(MAX_ITEM_QUANTITY)

    cart().updateQuantity(1, Number.NaN)
    expect(cart().items).toHaveLength(0)
  })

  it('removes a single item and clears the cart', () => {
    cart().addItem(risotto)
    cart().addItem(wine)
    cart().removeItem(1)
    expect(cart().items.map((item) => item.product_id)).toEqual([2])

    cart().clear()
    expect(cart().items).toEqual([])
  })

  it('computes total and item count without floating point drift', () => {
    cart().addItem({ product_id: 3, name: 'Água', price: 0.1 })
    cart().addItem({ product_id: 4, name: 'Pão', price: 0.2 })
    cart().addItem(risotto, 2)

    expect(selectCartTotal(cart())).toBe(118.1)
    expect(selectCartCount(cart())).toBe(4)
  })
})
