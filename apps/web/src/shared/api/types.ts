/**
 * Friendly aliases over the types generated from `openapi.json` (`npm run gen:api`).
 * Do not hand-write API types: a backend contract change must be a compile error.
 */
import type { components, paths } from './schema'

type Schemas = components['schemas']

/** Query-string parameters of a GET endpoint, straight from the contract. */
type QueryOf<P extends keyof paths> = paths[P] extends { get: { parameters: { query?: infer Q } } }
  ? NonNullable<Q>
  : never

// Identity
export type UserRole = Schemas['UserRole']
export type UserRead = Schemas['UserRead']
export type UserCreate = Schemas['UserCreate']
export type AdminUserCreate = Schemas['AdminUserCreate']
export type UserUpdate = Schemas['UserUpdate']
export type LoginRequest = Schemas['LoginRequest']
export type SessionResponse = Schemas['SessionResponse']
export type UserListParams = QueryOf<'/api/v1/users'>

// Catalog
export type CategoryRead = Schemas['CategoryRead']
export type CategoryCreate = Schemas['CategoryCreate']
export type CategoryUpdate = Schemas['CategoryUpdate']
export type ProductRead = Schemas['ProductRead']
export type ProductCreate = Schemas['ProductCreate']
export type ProductUpdate = Schemas['ProductUpdate']
export type ProductListParams = QueryOf<'/api/v1/products'>
export type AdminProductListParams = QueryOf<'/api/v1/products/admin'>

// Ordering
export type OrderStatus = Schemas['OrderStatus']
export type OrderCreate = Schemas['OrderCreate']
export type OrderItemCreate = Schemas['OrderItemCreate']
export type OrderItemRead = Schemas['OrderItemRead']
export type OrderRead = Schemas['OrderRead']
export type OrderSummary = Schemas['OrderSummary']
export type OrderStatusUpdate = Schemas['OrderStatusUpdate']
export type TrackingEventRead = Schemas['TrackingEventRead']
export type OrderListParams = QueryOf<'/api/v1/orders'>

// Notifications
export type NotificationRead = Schemas['NotificationRead']
export type UnreadCount = Schemas['UnreadCount']
export type MarkAllResult = Schemas['MarkAllResult']
export type NotificationListParams = QueryOf<'/api/v1/notifications'>

// Analytics
export type OrdersAnalytics = Schemas['OrdersAnalytics']
export type DailyPoint = Schemas['DailyPoint']
export type DurationStats = Schemas['DurationStats']
export type StatusCount = Schemas['StatusCount']
export type TopProduct = Schemas['TopProduct']
export type OrdersAnalyticsParams = QueryOf<'/api/v1/analytics/orders'>

// Shared envelopes
export type ApiValidationError = Schemas['ValidationError']

/** Cursor pagination envelope used by every list endpoint (`Page_*_` in the contract). */
export type Page<T> = { items: T[]; next_cursor: string | null }

/**
 * Error body returned by every non-2xx response. FastAPI's generated schema only documents
 * the 422 variant (`HTTPValidationError`); the API adds `code` and `request_id` to all of them.
 */
export type ApiErrorBody = {
  detail: string | ApiValidationError[]
  code: string
  request_id: string
}

// Server-Sent Events (`GET /events/stream`). Not described by OpenAPI, so declared here.
export type OrderUpdatedEvent = {
  event_id: string
  order_id: number
  status: OrderStatus
  previous_status: OrderStatus | null
}

export type OrderCreatedEvent = OrderUpdatedEvent & {
  total_amount: number | string | null
}

export type RealtimeEventMap = {
  ready: { channels: number }
  'order.updated': OrderUpdatedEvent
  'order.created': OrderCreatedEvent
  'notification.created': NotificationRead
}
