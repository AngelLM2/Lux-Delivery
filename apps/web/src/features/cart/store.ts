import { create } from 'zustand'

/** Same limit as `OrderItemCreate.quantity` in the API contract. */
export const MAX_ITEM_QUANTITY = 50

export type CartItem = {
  product_id: number
  name: string
  price: number
  quantity: number
}

type CartState = {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  /** Quantity <= 0 removes the item. */
  updateQuantity: (productId: number, quantity: number) => void
  removeItem: (productId: number) => void
  clear: () => void
}

const clampQuantity = (quantity: number) => Math.min(MAX_ITEM_QUANTITY, Math.max(0, Math.floor(quantity)))

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item, quantity = 1) =>
    set((state) => {
      const existing = state.items.find((entry) => entry.product_id === item.product_id)
      if (existing) {
        return {
          items: state.items.map((entry) =>
            entry.product_id === item.product_id
              ? { ...entry, ...item, quantity: clampQuantity(entry.quantity + quantity) }
              : entry,
          ),
        }
      }
      const initial = clampQuantity(quantity)
      return initial > 0 ? { items: [...state.items, { ...item, quantity: initial }] } : state
    }),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items
        .map((entry) =>
          entry.product_id === productId
            ? { ...entry, quantity: clampQuantity(Number.isFinite(quantity) ? quantity : 0) }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    })),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((entry) => entry.product_id !== productId) })),
  clear: () => set({ items: [] }),
}))

export const selectCartTotal = (state: Pick<CartState, 'items'>) =>
  // Cents avoid floating point drift (0.1 + 0.2) when summing prices.
  state.items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100

export const selectCartCount = (state: Pick<CartState, 'items'>) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0)
