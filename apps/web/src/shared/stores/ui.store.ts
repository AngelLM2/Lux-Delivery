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
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void
}

const MAX_TOASTS = 4
let toastSeq = 0

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  isCartOpen: false,
  addToast: (toast) => {
    toastSeq += 1
    const id = `toast-${toastSeq}`
    set((state) => {
      // Same message already on screen (e.g. several requests failing at once): do not stack it.
      if (state.toasts.some((item) => item.message === toast.message && item.type === toast.type)) {
        return state
      }
      const next: Toast = { ...toast, id, duration: toast.duration ?? 4200 }
      return { toasts: [...state.toasts, next].slice(-MAX_TOASTS) }
    })
    return id
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  openCart: () => set({ isCartOpen: true }),
  closeCart: () => set({ isCartOpen: false }),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
}))

/** Imperative helpers for non-React code (axios interceptors, SSE handlers, mutations). */
export const toast = {
  success: (message: string, duration?: number) =>
    useUiStore.getState().addToast({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    useUiStore.getState().addToast({ type: 'error', message, duration }),
  info: (message: string, duration?: number) =>
    useUiStore.getState().addToast({ type: 'info', message, duration }),
}
