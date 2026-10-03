export type UserRole = 'admin' | 'customer'

export type OrderStatus =
  | 'created'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'canceled'

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

export interface UserRead {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserCreate {
  full_name: string
  email: string
  phone?: string | null
  password: string
  role?: UserRole
}

export interface UserUpdate {
  full_name?: string
  phone?: string | null
  actualy_password: string
  password?: string | null
  password_confirm?: string | null
}

export interface ProductRead {
  id: number
  name: string
  price: number
  description: string
  short_description: string
  image_url?: string | null
  is_offer: boolean
  category_id: number | null
  highlights?: boolean
}

export interface ProductCreate {
  name: string
  price: number
  description: string
  short_description: string
  is_offer?: boolean
  category_id?: number | null
  highlights?: boolean
}

export interface ProductUpdate {
  name?: string
  price?: number
  description?: string
  short_description?: string
  is_offer?: boolean
  category_id?: number | null
  highlights?: boolean
}

export interface CategoryRead {
  id: number
  name: string
}

export interface CategoryCreate {
  name: string
}

export interface CategoryUpdate {
  name: string
}

export interface OrderItemCreate {
  product_id: number
  quantity: number
}

export interface OrderCreate {
  delivery_address: string
  notes?: string | null
  items: OrderItemCreate[]
}

export interface OrderStatusUpdate {
  status: OrderStatus
  description?: string | null
}

export interface OrderItemRead {
  id: number
  product_id: number
  quantity: number
  unit_price: number
  total_price: number
}

export interface TrackingEventRead {
  id: number
  status: OrderStatus
  description: string
  created_by_user_id: number | null
  created_at: string
}

export interface OrderRead {
  id: number
  customer_id: number
  status: OrderStatus
  total_amount: number
  delivery_address: string
  notes: string | null
  created_at: string
  updated_at: string
  confirmed_at: string | null
  preparing_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  canceled_at: string | null
  items: OrderItemRead[]
  tracking_events: TrackingEventRead[]
}

export interface NotificationRead {
  id: number
  user_id: number
  order_id: number
  event_type: string
  message: string
  is_read: boolean
  created_at: string
}

export interface OrdersAnalyticsRead {
  period_start: string
  period_end: string
  total_orders: number
  delivered_orders: number
  canceled_orders: number
  avg_minutes_to_confirm: number | null
  avg_minutes_to_dispatch: number | null
  avg_minutes_to_deliver: number | null
  status_breakdown: Array<{ status: string; count: number }>
}
