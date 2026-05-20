// Database types
export interface Restaurant {
  id: string
  name: string
  logo_url?: string
  business_hours?: string
  features?: Record<string, boolean> | string[]
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
  clock_in_latitude?: number
  clock_in_longitude?: number
  clock_in_ip?: string
  verification_method?: 'webauthn' | 'pin' | 'manual'
  clock_out_latitude?: number
  clock_out_longitude?: number
  clock_out_ip?: string
  created_at?: string
  employee?: Employee
}

// =========== 补打卡审批 ===========

export type CorrectionType = 'clock_in' | 'clock_out'
export type CorrectionStatus = 'pending' | 'approved' | 'rejected'

export interface AttendanceCorrection {
  id: string
  employee_id: string
  restaurant_id: string
  correction_date: string
  correction_type: CorrectionType
  requested_time: string
  reason?: string
  status: CorrectionStatus
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
  attendance_id?: string
  created_at: string
  updated_at: string
  employee?: Employee
  reviewer?: Employee
}

// =========== 安全打卡新类型 ===========

export interface StoreLocation {
  id: string
  restaurant_id: string
  location_name: string
  latitude: number
  longitude: number
  allowed_radius: number
  wifi_ssid?: string[]
  is_active: boolean
  created_at: string
}

export interface EmployeeBiometric {
  id: string
  employee_id: string
  biometric_type: 'pin' | 'webauthn'
  credential_id?: string
  public_key?: string
  pin_hash?: string
  pin_salt?: string
  device_name?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EmployeeDevice {
  id: string
  employee_id: string
  device_id: string
  device_name?: string
  user_agent?: string
  platform?: string
  is_active: boolean
  bound_at: string
  last_used_at: string
}

export interface AttendanceAuditLog {
  id: string
  attendance_id?: string
  employee_id: string
  action: 'clock_in' | 'clock_out' | 'edit' | 'delete'
  action_by?: string
  ip_address?: string
  device_info?: Record<string, unknown>
  location_info?: Record<string, unknown>
  verification_result?: Record<string, unknown>
  created_at: string
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
  ordered_at?: string
  received_at?: string
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
  payment_status?: 'cash' | 'bank' | 'unpaid'
  supplier?: string
  created_at: string
}

// AI Types
export interface ChatMessage {
  id: string
  session_id: string
  restaurant_id?: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface AISession {
  id: string
  restaurant_id: string
  customer_name?: string
  customer_contact?: string
  status: 'active' | 'closed'
  message_count: number
  summary?: string
  created_at: string
  updated_at: string
  messages?: ChatMessage[]
}

export interface AIKnowledgeBase {
  id: string
  restaurant_id: string
  category: string
  question: string
  answer: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AIConfigEntry {
  id: string
  restaurant_id: string
  config_key: string
  config_value: Record<string, unknown>
  updated_at: string
}

export interface AISuggestion {
  id: string
  restaurant_id: string
  session_id: string
  message_id: string
  role: 'user' | 'assistant'
  original_question?: string
  original_answer?: string
  suggested_answer: string
  notes?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
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
  edited_content?: string
  for_training?: boolean
  reviewed_at?: string
  reviewed_by?: string
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

// =========== Permission System ===========

/** 系统所有权限的定义（key = 权限标识, value = 中文说明） */
export const ALL_PERMISSIONS = {
  // 控制面板
  'dashboard.view': '查看控制面板',

  // POS 点餐
  'pos.create_order': '建立訂單',
  'pos.cancel_order': '取消訂單',
  'pos.refund': '退款操作',

  // 产品管理
  'product.view': '查看產品',
  'product.manage': '管理產品（新增/編輯/刪除）',

  // 库存管理
  'inventory.view': '查看庫存',
  'inventory.manage': '管理庫存',

  // 订货管理
  'order.view': '查看訂貨',
  'order.create': '建立訂貨單',
  'order.approve': '審批訂貨',

  // 员工管理
  'employee.view': '查看員工',
  'employee.manage': '管理員工（新增/編輯/刪除）',

  // 打卡管理
  'attendance.view': '查看打卡記錄',
  'attendance.manage': '管理打卡',

  // 排班管理
  'schedule.view': '查看排班',
  'schedule.manage': '管理排班',

  // 薪酬管理
  'payroll.view': '查看薪酬',
  'payroll.manage': '管理薪酬',

  // 财务管理
  'expense.view': '查看支出',
  'expense.manage': '管理支出',

  // 报表
  'report.view': '查看報表',
  'report.export': '匯出報表',

  // AI 功能
  'ai.marketing': 'AI 行銷管理',
  'ai.customer_service': 'AI 客服管理',
  'ai.knowledge_base': 'AI 知識庫管理',

  // 评价管理
  'review.view': '查看評價',
  'review.manage': '管理評價',

  // 系统设置
  'setting.view': '查看設定',
  'setting.manage': '管理設定',
} as const

export type PermissionKey = keyof typeof ALL_PERMISSIONS

/** 系统内置角色的默认权限分配 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Employee['role'], PermissionKey[]> = {
  owner: Object.keys(ALL_PERMISSIONS) as PermissionKey[],
  manager: [
    'dashboard.view',
    'pos.create_order', 'pos.cancel_order', 'pos.refund',
    'product.view', 'product.manage',
    'inventory.view', 'inventory.manage',
    'order.view', 'order.create', 'order.approve',
    'employee.view',
    'attendance.view', 'attendance.manage',
    'schedule.view', 'schedule.manage',
    'payroll.view', 'payroll.manage',
    'expense.view', 'expense.manage',
    'report.view', 'report.export',
    'ai.marketing', 'ai.customer_service', 'ai.knowledge_base',
    'review.view', 'review.manage',
    'setting.view',
  ],
  staff: [
    'dashboard.view',
    'pos.create_order',
    'product.view',
    'inventory.view',
    'order.view', 'order.create',
    'attendance.view', 'attendance.manage',
    'schedule.view',
    'expense.view',
  ],
}

/** 每间餐厅可自定义的角色权限配置（数据库对应 restaurant_roles 表） */
export interface RestaurantRole {
  id: string
  restaurant_id: string
  role_name: string            // 'owner' | 'manager' | 'staff' + 可扩展自定义角色
  permissions: PermissionKey[] // 该角色拥有的权限列表
  created_at: string
  updated_at: string
}
