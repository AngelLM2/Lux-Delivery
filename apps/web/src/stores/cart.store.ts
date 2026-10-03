import { create } from 'zustand'

export type CartItem = {
  product_id: number
  name: string
  price: number
  quantity: number
}

type CartState = {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  removeItem: (productId: number) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item, quantity = 1) => {
    set((state) => {
      const existing = state.items.find((entry) => entry.product_id === item.product_id)
      if (existing) {
        return {
          items: state.items.map((entry) =>
            entry.product_id === item.product_id
              ? { ...entry, quantity: entry.quantity + quantity }
              : entry,
          ),
        }
      }
      return { items: [...state.items, { ...item, quantity }] }
    })
  },
  updateQuantity: (productId, quantity) => {
    set((state) => ({
      items: state.items
        .map((entry) =>
          entry.product_id === productId
            ? { ...entry, quantity: Math.max(0, quantity) }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    }))
  },
  removeItem: (productId) => {
    set((state) => ({ items: state.items.filter((entry) => entry.product_id !== productId) }))
  },
  clear: () => set({ items: [] }),
}))
