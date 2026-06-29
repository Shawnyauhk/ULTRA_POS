import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type {
  Product,
  Category,
  Inventory,
  Employee,
  Attendance,
  OrderRequest,
  Order,
  OrderItem,
  Setting,
  Review,
  Expense,
  Schedule,
  UnavailabilityRecord,
  SchedulingRuleRecord,
  Recipe
} from '@/types'

// Default restaurant ID for demo
const DEMO_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'
const FALLBACK_RESTAURANT_ID = DEMO_RESTAURANT_ID
export { FALLBACK_RESTAURANT_ID }

// ============================================
// Restaurant Hook
// ============================================

export function useRestaurant() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRestaurant = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', DEMO_RESTAURANT_ID)
        .single()

      if (fetchError) throw fetchError
      setRestaurant(data)
    } catch (err) {
      console.error('Error fetching restaurant:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch restaurant')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRestaurant()
  }, [fetchRestaurant])

  return { restaurant, loading, error, refetch: fetchRestaurant }
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
        .eq('status', 'available')
        .order('name')

      if (productsError) throw productsError
      setProducts(productsData || [])

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
          restaurant_id: DEMO_RESTAURANT_ID,
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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

  const addEmployee = async (data: Omit<Employee, 'id' | 'created_at' | 'restaurant_id'>) => {
    try {
      const rid = useAuthStore.getState().user?.restaurant_id || DEMO_RESTAURANT_ID
      const { error: insertError } = await supabase
        .from('employees')
        .insert([{ ...data, restaurant_id: rid, is_active: true }])

      if (insertError) throw insertError
      await fetchEmployees()
      return true
    } catch (err) {
      console.error('Error adding employee:', err)
      return false
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
      console.error('Error deleting employee:', err)
      return false
    }
  }

  return { employees, loading, error, refetch: fetchEmployees, updateEmployee, addEmployee, deleteEmployee }
}

// ============================================
// Attendance Hooks
// ============================================

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

  return { attendance, loading, error, refetch: fetchAttendance }
}

// ============================================
// Schedule Hooks (排班)
// ============================================

export function useSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('schedules')
        .select('*, employee:employees(*)')
        .order('date', { ascending: true })

      if (fetchError) throw fetchError
      setSchedules(data || [])
    } catch (err) {
      console.error('Error fetching schedules:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const addSchedule = async (data: Omit<Schedule, 'id' | 'created_at' | 'status'>) => {
    try {
      const { error: insertError } = await supabase
        .from('schedules')
        .insert([{ ...data, status: 'scheduled' as const }])

      if (insertError) throw insertError
      await fetchSchedules()
      return true
    } catch (err) {
      console.error('Error adding schedule:', err)
      return false
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

export function useUnavailability(employeeId?: string, month?: string) {
  const [records, setRecords] = useState<UnavailabilityRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('employee_unavailability')
        .select('*')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)

      if (employeeId) query = query.eq('employee_id', employeeId)
      if (month) query = query.like('date', `${month}%`)

      const { data, error: fetchError } = await query.order('date', { ascending: true })
      if (fetchError) throw fetchError
      setRecords(data || [])
    } catch (err) {
      console.error('Error fetching unavailability:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch unavailability')
    } finally {
      setLoading(false)
    }
  }, [employeeId, month])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const toggleUnavailability = async (employeeId: string, date: string) => {
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('employee_unavailability')
        .select('id')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
        .eq('employee_id', employeeId)
        .eq('date', date)
        .maybeSingle()

      if (existing) {
        const { error: deleteError } = await supabase
          .from('employee_unavailability')
          .delete()
          .eq('id', existing.id)
        if (deleteError) throw deleteError
      } else {
        const { error: insertError } = await supabase
          .from('employee_unavailability')
          .insert([{ restaurant_id: DEMO_RESTAURANT_ID, employee_id: employeeId, date }])
        if (insertError) throw insertError
      }

      await fetchRecords()
      return true
    } catch (err) {
      console.error('Error toggling unavailability:', err)
      return false
    }
  }

  return { records, loading, error, refetch: fetchRecords, toggleUnavailability }
}

export function useSchedulingRules() {
  const [rules, setRules] = useState<SchedulingRuleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('scheduling_rules')
        .select('*')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError
      setRules(data || [])
    } catch (err) {
      console.error('Error fetching scheduling rules:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduling rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const addRule = async (rule: Omit<SchedulingRuleRecord, 'id' | 'created_at' | 'updated_at' | 'restaurant_id'>) => {
    try {
      const { error: insertError } = await supabase
        .from('scheduling_rules')
        .insert([{ ...rule, restaurant_id: DEMO_RESTAURANT_ID }])

      if (insertError) throw insertError
      await fetchRules()
      return true
    } catch (err) {
      console.error('Error adding scheduling rule:', err)
      return false
    }
  }

  const updateRule = async (id: string, updates: Partial<SchedulingRuleRecord>) => {
    try {
      const { error: updateError } = await supabase
        .from('scheduling_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
      await fetchRules()
      return true
    } catch (err) {
      console.error('Error updating scheduling rule:', err)
      return false
    }
  }

  const deleteRule = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('scheduling_rules')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchRules()
      return true
    } catch (err) {
      console.error('Error deleting scheduling rule:', err)
      return false
    }
  }

  return { rules, loading, error, refetch: fetchRules, addRule, updateRule, deleteRule }
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
        .select('*, employee:employees(*), items:order_request_items(*)')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
      const { error: updateError } = await supabase
        .from('order_requests')
        .update({ status, updated_at: new Date().toISOString() })
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
  items: Omit<OrderItem, 'id' | 'created_at' | 'order_id'>[]
) {
  for (const item of items) {
    if (!item.product_id) continue

    // 查找關聯此產品的庫存項目
    const { data: invItems, error: findError } = await supabase
      .from('inventory')
      .select('id, name, current_stock')
      .eq('product_id', item.product_id)

    if (findError) {
      console.warn(`查詢庫存失敗 (product_id=${item.product_id}):`, findError)
      continue
    }

    if (!invItems || invItems.length === 0) {
      // 沒有直接 product_id 關聯，嘗試按名稱匹配
      const { data: nameMatches, error: nameError } = await supabase
        .from('inventory')
        .select('id, name, current_stock')
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
          restaurant_id: DEMO_RESTAURANT_ID,
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
        await deductInventoryForItems(items)
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)

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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
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
          restaurant_id: DEMO_RESTAURANT_ID,
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

  return { reviews, loading, error, refetch: fetchReviews, createReview }
}

// ============================================
// Expenses Hooks
// ============================================

export function useExpenses(month?: string) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
        .order('expense_date', { ascending: false })

      if (month) {
        query = query.like('expense_date', `${month}%`)
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
  }, [month])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const createExpense = async (expense: Omit<Expense, 'id' | 'restaurant_id' | 'created_at'>) => {
    try {
      const { error: insertError } = await supabase
        .from('expenses')
        .insert([{
          restaurant_id: DEMO_RESTAURANT_ID,
          ...expense
        }])

      if (insertError) throw insertError
      // 非同步刷新列表，失敗不影響儲存結果
      fetchExpenses().catch(e => console.warn('刷新列表失敗:', e))
      return { success: true as const }
    } catch (err) {
      console.error('Error creating expense:', err)
      return { success: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const { error: updateError } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      fetchExpenses().catch(e => console.warn('刷新列表失敗:', e))
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
      fetchExpenses().catch(e => console.warn('刷新列表失敗:', e))
      return true
    } catch (err) {
      console.error('Error deleting expense:', err)
      return false
    }
  }

  return { expenses, loading, error, refetch: fetchExpenses, createExpense, updateExpense, deleteExpense }
}

// ============================================
// Recipe Hooks (秘傳配方)
// ============================================

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('recipes')
        .select('*')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError
      setRecipes(data || [])
    } catch (err) {
      console.error('Error fetching recipes:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch recipes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  const createRecipe = async (recipe: Omit<Recipe, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => {
    try {
      const { error: insertError } = await supabase
        .from('recipes')
        .insert([{ ...recipe, restaurant_id: DEMO_RESTAURANT_ID }])

      if (insertError) throw insertError
      await fetchRecipes()
      return true
    } catch (err) {
      console.error('Error creating recipe:', err)
      return false
    }
  }

  const updateRecipe = async (id: string, updates: Partial<Recipe>) => {
    try {
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
      await fetchRecipes()
      return true
    } catch (err) {
      console.error('Error updating recipe:', err)
      return false
    }
  }

  const deleteRecipe = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchRecipes()
      return true
    } catch (err) {
      console.error('Error deleting recipe:', err)
      return false
    }
  }

  return { recipes, loading, error, refetch: fetchRecipes, createRecipe, updateRecipe, deleteRecipe }
}

// ============================================
// Employee Self-Reported Hours (员工自助报工时)
// ============================================
export function useEmployeeSelfHours(month?: string) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('employee_hours_self')
        .select('*, employee:employees(name)')
        .eq('restaurant_id', DEMO_RESTAURANT_ID)
      if (month) query = query.eq('month', month)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('Error fetching self hours:', err)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const upsertSelfHours = async (employeeId: string, month: string, totalHours: number, totalAmount: number, notes?: string) => {
    try {
      const { error } = await supabase
        .from('employee_hours_self')
        .upsert({
          restaurant_id: DEMO_RESTAURANT_ID,
          employee_id: employeeId,
          month,
          total_hours: totalHours,
          total_amount: totalAmount,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'employee_id,month' })
      if (error) throw error
      await fetchRecords()
      return true
    } catch (err) {
      console.error('Error upserting self hours:', err)
      return false
    }
  }

  return { records, loading, refetch: fetchRecords, upsertSelfHours }
}
