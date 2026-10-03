import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export type Toast = {
  id: string
  type: ToastType
  message: string
  duration?: number
}

type UiState = {
  toasts: Toast[]
  isCartOpen: boolean
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void
  consumePendingToast: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  isCartOpen: false,
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((state) => ({
      toasts: [...state.toasts, { id, duration: 4200, ...toast }],
    }))
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
  openCart: () => set({ isCartOpen: true }),
  closeCart: () => set({ isCartOpen: false }),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
  consumePendingToast: () => {
    const pending = sessionStorage.getItem('lux_pending_toast')
    if (pending) {
      sessionStorage.removeItem('lux_pending_toast')
      get().addToast({ type: 'error', message: pending })
    }
  },
}))

export const uiStore = {
  getState: () => useUiStore.getState(),
}
