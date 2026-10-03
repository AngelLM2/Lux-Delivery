import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody, OrderRead, UserRead } from '../shared/api/types'

export const makeUser = (overrides: Partial<UserRead> = {}): UserRead => ({
  id: 1,
  full_name: 'Ana Souza',
  email: 'ana@example.com',
  phone: null,
  role: 'customer',
  is_active: true,
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-01-01T12:00:00Z',
  last_login_at: null,
  ...overrides,
})

export const makeOrder = (overrides: Partial<OrderRead> = {}): OrderRead => ({
  id: 1,
  customer_id: 1,
  status: 'created',
  total_amount: 117.8,
  delivery_address: 'Rua das Flores, 123',
  notes: null,
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
  confirmed_at: null,
  preparing_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  canceled_at: null,
  items: [{ id: 1, product_id: 1, product_name: 'Risoto', quantity: 2, unit_price: 58.9, total_price: 117.8 }],
  tracking_events: [],
  ...overrides,
})

/** An AxiosError shaped like the API's `{ detail, code, request_id }` responses. */
export const makeApiError = (
  status: number,
  body: Partial<ApiErrorBody> | string | null,
  headers: Record<string, string> = {},
  url = '/test',
) => {
  const config = { url, headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    { status, statusText: String(status), data: body, headers, config },
  )
}
