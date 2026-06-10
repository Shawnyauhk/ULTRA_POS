import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type {
  Product,
  Category,
  Inventory,
  Employee,
  Schedule,
  Attendance,
  OrderRequest,
  Order,
  OrderItem,
  Setting,
  Review,
  Expense,
  UnavailabilityRecord,
  SchedulingRuleRecord,
  Recipe,
} from '@/types'

// Fallback for demo mode - real users get their restaurant_id from auth store
export const FALLBACK_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'

function getRestaurantId(): string {
  const user = useAuthStore.getState().user
  return user?.restaurant_id || FALLBACK_RESTAURANT_ID
}

// ============================================
// Product & Category Hooks
// ============================================

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('restaurant_id', getRestaurantId())
        .eq('status', 'available')
        .order('name')

      if (productsError) throw productsError
      setProducts(productsData || [])

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('sort_order')

      if (categoriesError) throw categoriesError
      setCategories(categoriesData || [])
    } catch (err) {
      console.error('Error fetching products:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  return { products, categories, loading, error, refetch: fetchProducts }
}

// ============================================
// Inventory Hooks
// ============================================

export function useInventory() {
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('name')

      if (fetchError) throw fetchError
      setInventory(data || [])
    } catch (err) {
      console.error('Error fetching inventory:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const updateInventory = async (id: string, updates: Partial<Inventory>) => {
    try {
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ ...updates, last_updated: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
      await fetchInventory()
      return true
    } catch (err) {
      console.error('Error updating inventory:', err)
      return false
    }
  }

  const addInventory = async (item: Omit<Inventory, 'id' | 'created_at' | 'last_updated' | 'restaurant_id'>) => {
    try {
      const { error: insertError } = await supabase
        .from('inventory')
        .insert([{
          restaurant_id: getRestaurantId(),
          ...item,
          last_updated: new Date().toISOString()
        }])

      if (insertError) throw insertError
      await fetchInventory()
      return true
    } catch (err) {
      console.error('Error adding inventory:', err)
      return false
    }
  }

  return { inventory, loading, error, refetch: fetchInventory, updateInventory, addInventory }
}

// ============================================
// Employee Hooks
// ============================================

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('employees')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .eq('is_active', true)
        .order('name')

      if (fetchError) throw fetchError
      setEmployees(data || [])
    } catch (err) {
      console.error('Error fetching employees:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch employees')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const updateEmployee = async (id: string, updates: Partial<Employee>) => {
    try {
      const { error: updateError } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      await fetchEmployees()
      return true
    } catch (err) {
      console.error('Error updating employee:', err)
      return false
    }
  }

  const addEmployee = async (employeeData: Omit<Employee, 'id' | 'created_at' | 'restaurant_id' | 'is_active'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('employees')
        .insert([{
          restaurant_id: getRestaurantId(),
          is_active: true,
          ...employeeData
        }])
        .select()
        .single()

      if (insertError) throw insertError
      await fetchEmployees()
      return data
    } catch (err) {
      console.error('Error adding employee:', err)
      return null
    }
  }

  const deleteEmployee = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('employees')
        .update({ is_active: false })
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchEmployees()
      return true
    } catch (err) {
      console.error('Error deactivating employee:', err)
      return false
    }
  }

  return { employees, loading, error, refetch: fetchEmployees, updateEmployee, addEmployee, deleteEmployee }
}

// ============================================
// Restaurant Hooks
// ============================================

export function useRestaurant() {
  const [restaurant, setRestaurant] = useState<{
    id: string
    name: string
    business_hours?: string
    logo_url?: string
    features?: Record<string, boolean> | string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const rid = getRestaurantId()
    if (!rid || rid === FALLBACK_RESTAURANT_ID) {
      setRestaurant({
        id: rid,
        name: '家傳芋曉',
        business_hours: '11:00 - 22:00',
        features: {},
      })
      setLoading(false)
      return
    }

    supabase
      .from('restaurants')
      .select('id, name, business_hours, logo_url, features')
      .eq('id', rid)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching restaurant:', error)
          setRestaurant({ id: rid, name: '我的餐廳', business_hours: '' })
        } else {
          setRestaurant(data)
        }
        setLoading(false)
      })
  }, [])

  return { restaurant, loading }
}

export function useAttendance(employeeId?: string) {
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('attendance')
        .select('*, employee:employees(*)')
        .order('date', { ascending: false })

      if (employeeId) {
        query = query.eq('employee_id', employeeId)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      setAttendance(data || [])
    } catch (err) {
      console.error('Error fetching attendance:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch attendance')
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    fetchAttendance()
  }, [fetchAttendance])

  const addAttendance = async (record: Omit<Attendance, 'id' | 'created_at'>) => {
    try {
      const { error: insertError } = await supabase
        .from('attendance')
        .insert([record])

      if (insertError) throw insertError
      await fetchAttendance()
      return true
    } catch (err) {
      console.error('Error adding attendance:', err)
      return false
    }
  }

  const updateAttendance = async (id: string, updates: Partial<Attendance>) => {
    try {
      const { error: updateError } = await supabase
        .from('attendance')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      await fetchAttendance()
      return true
    } catch (err) {
      console.error('Error updating attendance:', err)
      return false
    }
  }

  const getTodayAttendance = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error: fetchError } = await supabase
        .from('attendance')
        .select('*, employee:employees(*)')
        .eq('date', today)
        .order('clock_in', { ascending: true })

      if (fetchError) throw fetchError
      return data || []
    } catch (err) {
      console.error('Error fetching today attendance:', err)
      return []
    }
  }, [])

  return { attendance, loading, error, refetch: fetchAttendance, addAttendance, updateAttendance, getTodayAttendance }
}

// ============================================
// Schedule Hooks
// ============================================

export function useSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true)
      const restaurantId = getRestaurantId()

      // 1) 取得當前餐廳的所有員工（用於後續 join）
      const { data: employeesData, error: empErr } = await supabase
        .from('employees')
        .select('id, name, role, phone, email, hourly_rate, monthly_salary, hire_date, is_active, restaurant_id, position, salary_type, work_days, monthly_rest_days, default_shift_minutes, probation_end, notes, updated_at, created_at')
        .eq('restaurant_id', restaurantId)

      if (empErr) {
        console.error('Error fetching employees for schedule join:', empErr.message)
      }
      const employeeMap: Record<string, any> = {}
      for (const emp of employeesData || []) {
        employeeMap[emp.id] = emp
      }

      // 2) 取得排班（不用 embed，避開多個外鍵衝突）
      const { data, error: fetchError } = await supabase
        .from('schedules')
        .select('*')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (fetchError) {
        console.error('Supabase schedules fetch error:', fetchError.message, fetchError.code, fetchError.details)
        throw fetchError
      }

      // 3) 手動關聯 employee 物件
      const enriched = (data || []).map(s => ({
        ...s,
        employee: employeeMap[s.employee_id] || null,
      }))

      setSchedules(enriched)
    } catch (err: any) {
      console.error('Error fetching schedules:', err?.message || err, err?.code, err?.details)
      setError(err instanceof Error ? err.message : `Failed to fetch schedules: ${err?.message || JSON.stringify(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const addSchedule = async (schedule: Omit<Schedule, 'id' | 'created_at'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('schedules')
        .insert([{
          employee_id: schedule.employee_id,
          date: schedule.date,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          shift_type: schedule.shift_type || 'full_day',
          status: schedule.status || 'confirmed',
          created_by: schedule.created_by || null,
          notes: schedule.notes || null,
        }])
        .select()
        .single()

      if (insertError) throw insertError
      await fetchSchedules()
      return data
    } catch (err) {
      console.error('Error adding schedule:', err)
      return null
    }
  }

  const deleteSchedule = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchSchedules()
      return true
    } catch (err) {
      console.error('Error deleting schedule:', err)
      return false
    }
  }

  return { schedules, loading, error, refetch: fetchSchedules, addSchedule, deleteSchedule }
}

// ============================================
// Order Request Hooks
// ============================================

export function useOrderRequests() {
  const [orderRequests, setOrderRequests] = useState<OrderRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderRequests = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('order_requests')
        .select('*, employee:employees(*), items:order_request_items(*, inventory:inventory(*))')
        .eq('restaurant_id', getRestaurantId())
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setOrderRequests(data || [])
    } catch (err) {
      console.error('Error fetching order requests:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch order requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrderRequests()
  }, [fetchOrderRequests])

  const updateOrderRequestStatus = async (id: string, status: string) => {
    try {
      const now = new Date().toISOString()
      const updates: Record<string, any> = { status, updated_at: now }
      // 記錄各階段時間戳
      if (status === 'ordered') updates.ordered_at = now
      if (status === 'received') updates.received_at = now

      const { error: updateError } = await supabase
        .from('order_requests')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      await fetchOrderRequests()
      return true
    } catch (err) {
      console.error('Error updating order request status:', err)
      return false
    }
  }

  return { orderRequests, loading, error, refetch: fetchOrderRequests, updateOrderRequestStatus }
}

// 輔助函數：下單後自動扣減庫存
async function deductInventoryForItems(
  items: Omit<OrderItem, 'id' | 'created_at' | 'order_id'>[],
  restaurantId: string
) {
  for (const item of items) {
    if (!item.product_id) continue

    // 查找關聯此產品的庫存項目
    const { data: invItems, error: findError } = await supabase
      .from('inventory')
      .select('id, name, current_stock')
      .eq('product_id', item.product_id)
      .eq('restaurant_id', restaurantId)

    if (findError) {
      console.warn(`查詢庫存失敗 (product_id=${item.product_id}):`, findError)
      continue
    }

    if (!invItems || invItems.length === 0) {
      // 沒有直接 product_id 關聯，嘗試按名稱匹配
      const { data: nameMatches, error: nameError } = await supabase
        .from('inventory')
        .select('id, name, current_stock')
        .eq('restaurant_id', restaurantId)
        .ilike('name', `%${item.product_name}%`)

      if (nameError || !nameMatches || nameMatches.length === 0) {
        console.log(`未找到與 "${item.product_name}" 關聯的庫存，跳過扣減`)
        continue
      }

      // 按名稱匹配並扣減（取第一個匹配項）
      const match = nameMatches[0]
      const newStock = Math.max(0, match.current_stock - item.quantity)
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ current_stock: newStock, last_updated: new Date().toISOString() })
        .eq('id', match.id)

      if (updateError) {
        console.warn(`扣減庫存失敗 (${match.name}):`, updateError)
      } else {
        console.log(`已扣減庫存: ${match.name} (-${item.quantity}, 餘額: ${newStock})`)
      }
      continue
    }

    // 直接 product_id 關聯的庫存
    for (const inv of invItems) {
      const newStock = Math.max(0, inv.current_stock - item.quantity)
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ current_stock: newStock, last_updated: new Date().toISOString() })
        .eq('id', inv.id)

      if (updateError) {
        console.warn(`扣減庫存失敗 (${inv.name}):`, updateError)
      } else {
        console.log(`已扣減庫存: ${inv.name} (-${item.quantity}, 餘額: ${newStock})`)
      }
    }
  }
}

// ============================================
// Order Hooks (POS)
// ============================================

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async (limit = 100) => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('restaurant_id', getRestaurantId())
        .order('created_at', { ascending: false })
        .limit(limit)

      if (fetchError) throw fetchError
      setOrders(data || [])
    } catch (err) {
      console.error('Error fetching orders:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const createOrder = async (
    orderData: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'restaurant_id'>,
    items: Omit<OrderItem, 'id' | 'created_at' | 'order_id'>[]
  ) => {
    try {
      // Generate order number
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`

      // Insert order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          restaurant_id: getRestaurantId(),
          order_number: orderNumber,
          ...orderData
        }])
        .select()
        .single()

      if (orderError) throw orderError

      // Insert order items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(items.map(item => ({
            ...item,
            order_id: order.id
          })))

        if (itemsError) throw itemsError

        // Auto-deduct inventory for items with product_id
        await deductInventoryForItems(items, getRestaurantId())
      }

      await fetchOrders()
      return order
    } catch (err) {
      console.error('Error creating order:', err)
      return null
    }
  }

  return { orders, loading, error, refetch: fetchOrders, createOrder }
}

// ============================================
// Settings Hooks
// ============================================

export function useSettings() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('settings')
        .select('*')
        .eq('restaurant_id', getRestaurantId())

      if (fetchError) throw fetchError
      setSettings(data || [])
    } catch (err) {
      console.error('Error fetching settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const getSetting = (key: string, defaultValue: string = ''): string => {
    const setting = settings.find(s => s.setting_key === key)
    return setting?.setting_value || defaultValue
  }

  const updateSetting = async (key: string, value: string) => {
    try {
      const { error: updateError } = await supabase
        .from('settings')
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq('restaurant_id', getRestaurantId())
        .eq('setting_key', key)

      if (updateError) throw updateError
      await fetchSettings()
      return true
    } catch (err) {
      console.error('Error updating setting:', err)
      return false
    }
  }

  return { settings, loading, error, refetch: fetchSettings, getSetting, updateSetting }
}

// ============================================
// Reviews Hooks
// ============================================

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('reviews')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setReviews(data || [])
    } catch (err) {
      console.error('Error fetching reviews:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch reviews')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const createReview = async (review: Omit<Review, 'id' | 'created_at' | 'restaurant_id'>) => {
    try {
      const { error: insertError } = await supabase
        .from('reviews')
        .insert([{
          restaurant_id: getRestaurantId(),
          ...review
        }])

      if (insertError) throw insertError
      await fetchReviews()
      return true
    } catch (err) {
      console.error('Error creating review:', err)
      return false
    }
  }

  const updateReview = async (id: string, updates: Partial<Review>) => {
    try {
      const { error: updateError } = await supabase
        .from('reviews')
        .update(updates)
        .eq('id', id)
        .eq('restaurant_id', getRestaurantId())

      if (updateError) throw updateError
      await fetchReviews()
      return true
    } catch (err) {
      console.error('Error updating review:', err)
      return false
    }
  }

  const deleteReview = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('reviews')
        .delete()
        .eq('id', id)
        .eq('restaurant_id', getRestaurantId())

      if (deleteError) throw deleteError
      await fetchReviews()
      return true
    } catch (err) {
      console.error('Error deleting review:', err)
      return false
    }
  }

  return { reviews, loading, error, refetch: fetchReviews, createReview, updateReview, deleteReview }
}

// ============================================
// Expenses Hooks
// ============================================

export function useExpenses(startDate?: string, endDate?: string) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('expense_date', { ascending: false })

      if (startDate && endDate) {
        query = query.gte('expense_date', startDate).lte('expense_date', endDate)
      } else if (startDate) {
        query = query.gte('expense_date', startDate)
      } else if (endDate) {
        query = query.lte('expense_date', endDate)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      setExpenses(data || [])
    } catch (err) {
      console.error('Error fetching expenses:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const createExpense = async (expense: Omit<Expense, 'id' | 'restaurant_id' | 'created_at'>) => {
    try {
      const { error: insertError } = await supabase
        .from('expenses')
        .insert([{
          restaurant_id: getRestaurantId(),
          ...expense
        }])

      if (insertError) throw insertError
      await fetchExpenses()
      return { success: true }
    } catch (err: any) {
      console.error('Error creating expense:', err)
      // 嘗試提取所有可能的錯誤訊息
      let errMsg = ''
      if (typeof err === 'string') errMsg = err
      else if (err?.message) errMsg = err.message
      else if (err?.error_description) errMsg = err.error_description
      else if (err?.details) errMsg = err.details
      else if (err?.code === '42501') errMsg = 'RLS 權限不足，請執行 SQL 添加 anon 權限策略'
      else {
        try { errMsg = JSON.stringify(err) } catch { errMsg = '未知錯誤' }
      }
      console.error('Detailed expense error:', errMsg)
      return { success: false, error: errMsg }
    }
  }

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const { error: updateError } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      await fetchExpenses()
      return true
    } catch (err) {
      console.error('Error updating expense:', err)
      return false
    }
  }

  const deleteExpense = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchExpenses()
      return true
    } catch (err) {
      console.error('Error deleting expense:', err)
      return false
    }
  }

  return { expenses, loading, error, refetch: fetchExpenses, createExpense, updateExpense, deleteExpense }
}

// ============================================
// Employee Unavailability Hooks
// ============================================

export function useUnavailability(employeeId?: string, month?: string) {
  const [records, setRecords] = useState<UnavailabilityRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('employee_unavailability')
        .select('*')
        .eq('restaurant_id', getRestaurantId())

      if (employeeId) {
        query = query.eq('employee_id', employeeId)
      }

      if (month) {
        const [y, m] = month.split('-')
        const start = `${y}-${m}-01`
        const endDate = new Date(parseInt(y), parseInt(m), 0)
        const end = endDate.toISOString().split('T')[0]
        query = query.gte('date', start).lte('date', end)
      }

      const { data, error } = await query.order('date', { ascending: true })
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('Error fetching unavailability:', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId, month])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const toggleUnavailability = async (date: string, reason?: string) => {
    // Check if record exists
    const existing = records.find(r => r.date === date && (!employeeId || r.employee_id === employeeId))
    if (existing) {
      const { error } = await supabase
        .from('employee_unavailability')
        .delete()
        .eq('id', existing.id)
      if (error) { console.error('Error deleting unavailability:', error); return false }
    } else {
      const { error } = await supabase
        .from('employee_unavailability')
        .insert([{
          restaurant_id: getRestaurantId(),
          employee_id: employeeId || useAuthStore.getState().user?.id,
          date,
          reason: reason || '',
        }])
      if (error) { console.error('Error adding unavailability:', error); return false }
    }
    await fetchRecords()
    return true
  }

  const isUnavailable = (date: string): boolean => {
    return records.some(r => r.date === date && (!employeeId || r.employee_id === employeeId))
  }

  return { records, loading, refetch: fetchRecords, toggleUnavailability, isUnavailable }
}

// ============================================
// Scheduling Rules Hooks
// ============================================

export function useSchedulingRules() {
  const [rules, setRules] = useState<SchedulingRuleRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('scheduling_rules')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('sort_order', { ascending: true })
      if (error) throw error
      setRules(data || [])
    } catch (err) {
      console.error('Error fetching scheduling rules:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const addRule = async (rule: Omit<SchedulingRuleRecord, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase
      .from('scheduling_rules')
      .insert([{ restaurant_id: getRestaurantId(), ...rule }])
    if (error) { console.error('Error adding rule:', error); return false }
    await fetchRules()
    return true
  }

  const updateRule = async (id: string, updates: Partial<SchedulingRuleRecord>) => {
    const { error } = await supabase
      .from('scheduling_rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { console.error('Error updating rule:', error); return false }
    await fetchRules()
    return true
  }

  const deleteRule = async (id: string) => {
    const { error } = await supabase
      .from('scheduling_rules')
      .delete()
      .eq('id', id)
    if (error) { console.error('Error deleting rule:', error); return false }
    await fetchRules()
    return true
  }

  return { rules, loading, refetch: fetchRules, addRule, updateRule, deleteRule }
}

// ============================================
// Recipe Hooks (店主專用，秘傳配方)
// ============================================

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('restaurant_id', getRestaurantId())
        .order('product_name', { ascending: true })
      if (error) throw error
      setRecipes(data || [])
    } catch (err) {
      console.error('Error fetching recipes:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  const createRecipe = async (recipe: Omit<Recipe, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('recipes')
      .insert([{ restaurant_id: getRestaurantId(), ...recipe }])
      .select()
      .single()
    if (error) { console.error('Error creating recipe:', error); return null }
    await fetchRecipes()
    return data
  }

  const updateRecipe = async (id: string, updates: Partial<Omit<Recipe, 'id' | 'restaurant_id' | 'created_at'>>) => {
    const { data, error } = await supabase
      .from('recipes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error('Error updating recipe:', error); return null }
    await fetchRecipes()
    return data
  }

  const deleteRecipe = async (id: string) => {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id)
    if (error) { console.error('Error deleting recipe:', error); return false }
    await fetchRecipes()
    return true
  }

  return { recipes, loading, refetch: fetchRecipes, createRecipe, updateRecipe, deleteRecipe }
}
