// Database types
export interface Restaurant {
  id: string
  name: string
  logo_url?: string
  business_hours?: string
  created_at: string
}

export interface Employee {
  id: string
  restaurant_id: string
  name: string
  phone?: string
  email?: string
  role: 'owner' | 'manager' | 'staff'
  hourly_rate?: number
  monthly_salary?: number
  hire_date: string
  is_active: boolean
  created_at: string
}

export interface Schedule {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string
  created_at: string
  employee?: Employee
}

export interface Attendance {
  id: string
  employee_id: string
  date: string
  clock_in?: string
  clock_out?: string
  work_hours?: number
  created_at?: string
  employee?: Employee
}

export interface Category {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  restaurant_id: string
  category_id: string
  name: string
  name_en?: string
  price: number
  description?: string
  image_url?: string
  status: 'available' | 'sold_out' | 'discontinued'
  created_at: string
  updated_at: string
  category?: Category
}

export interface Inventory {
  id: string
  restaurant_id: string
  category: string
  name: string
  unit: string
  current_stock: number
  min_stock_level: number
  supplier?: string
  product_id?: string
  last_updated: string
  created_at: string
}

export type OrderRequestStatus = 'pending' | 'approved' | 'rejected' | 'ordered' | 'partial' | 'received'

export interface OrderRequest {
  id: string
  restaurant_id: string
  requested_by: string
  status: OrderRequestStatus
  notes?: string
  created_at: string
  updated_at: string
  employee?: Employee
  items?: OrderRequestItem[]
}

export interface OrderRequestItem {
  id: string
  order_request_id: string
  inventory_id: string
  requested_quantity: number
  approved_quantity?: number
  received_quantity?: number
  unit_price?: number
  created_at: string
  inventory?: Inventory
}

export interface GoodsReceipt {
  id: string
  order_request_id: string
  received_by: string
  received_at: string
  notes?: string
}

export type ExpenseCategory = 'food' | 'rent' | 'utilities' | 'salary' | 'supplies' | 'other'

export interface Expense {
  id: string
  restaurant_id: string
  category: ExpenseCategory
  amount: number
  description?: string
  receipt_url?: string
  expense_date: string
  handler?: string
  created_at: string
}

// AI Types
export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Order Types
export type PaymentMethod = 'cash' | 'octopus' | 'alipay' | 'wechat' | 'visa'
export type OrderType = 'dine_in' | 'takeout' | 'delivery'
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'

export interface Order {
  id: string
  restaurant_id: string
  order_number: string
  customer_name?: string
  customer_phone?: string
  total_amount: number
  discount_amount: number
  final_amount: number
  payment_method?: PaymentMethod
  order_type?: OrderType
  status: OrderStatus
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id?: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  options?: string[]
  notes?: string
  created_at: string
}

// Settings Types
export type SettingType = 'string' | 'number' | 'boolean' | 'json'

export interface Setting {
  id: string
  restaurant_id: string
  setting_key: string
  setting_value: string
  setting_type: SettingType
  description?: string
  updated_at: string
  created_at: string
}

// Review Types
export type ReviewType = 'auto_generated' | 'manual' | 'customer'
export type ReviewStatus = 'draft' | 'posted' | 'rejected'
export type Platform = 'google' | 'facebook' | 'openrice' | 'tripadvisor' | 'internal'

export interface Review {
  id: string
  restaurant_id: string
  order_id?: string
  review_type: ReviewType
  content: string
  rating?: number
  platform?: Platform
  status: ReviewStatus
  posted_at?: string
  created_by?: string
  created_at: string
}

// Report Types
export type ReportType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom'

export interface Report {
  id: string
  restaurant_id: string
  report_type: ReportType
  title: string
  content: string
  summary?: string
  period_start?: string
  period_end?: string
  generated_by?: string
  created_by?: string
  created_at: string
  updated_at: string
}
