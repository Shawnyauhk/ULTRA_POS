import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart,
  Clock,
  AlertTriangle,
  DollarSign,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Inventory, OrderRequest } from '@/types'

export function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState({
    lowStockItems: 0,
    pendingOrders: 0,
    todayAttendance: 0,
    monthlyExpense: 0,
  })
  const [lowStockItems, setLowStockItems] = useState<Inventory[]>([])
  const [pendingOrders, setPendingOrders] = useState<OrderRequest[]>([])

  useEffect(() => {
    // In demo mode, use mock data
    if (!import.meta.env.VITE_SUPABASE_URL) {
      setLowStockItems([
        { id: '1', restaurant_id: 'demo', category: '糖水配料', name: '黑糖粉條', unit: '包', current_stock: 5, min_stock_level: 20, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: '2', restaurant_id: 'demo', category: '茶用品', name: '鴨屎香茶葉', unit: '包', current_stock: 3, min_stock_level: 10, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: '3', restaurant_id: 'demo', category: '碗/杯/袋', name: '單杯袋', unit: '個', current_stock: 50, min_stock_level: 500, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      ])
      setPendingOrders([
        { id: '1', restaurant_id: 'demo', requested_by: 'demo-1', status: 'pending', notes: '急需補充', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ])
      setStats({
        lowStockItems: 3,
        pendingOrders: 1,
        todayAttendance: 5,
        monthlyExpense: 15000,
      })
      return
    }

    // Fetch real data
    const fetchData = async () => {
      // Fetch low stock items
      const { data: inventory } = await supabase
        .from('inventory')
        .select('*')
        .lt('current_stock', supabase.rpc('min_stock_level'))

      // Fetch pending orders
      const { data: orders } = await supabase
        .from('order_requests')
        .select('*')
        .eq('status', 'pending')

      // Set data
      if (inventory) {
        setLowStockItems(inventory)
        setStats(prev => ({ ...prev, lowStockItems: inventory.length }))
      }
      if (orders) {
        setPendingOrders(orders)
        setStats(prev => ({ ...prev, pendingOrders: orders.length }))
      }
    }

    fetchData()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">儀表板</h1>
        <p className="text-gray-500 mt-1">歡迎回來，{user?.name}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">待處理訂貨</p>
                <p className="text-3xl font-bold">{stats.pendingOrders}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">庫存預警</p>
                <p className="text-3xl font-bold">{stats.lowStockItems}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">今日打卡</p>
                <p className="text-3xl font-bold">{stats.todayAttendance}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">本月支出</p>
                <p className="text-3xl font-bold">${stats.monthlyExpense.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <DollarSign className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              庫存預警
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-gray-500 text-sm">目前沒有庫存預警</p>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="warning">庫存不足</Badge>
                      <p className="text-sm text-yellow-600 mt-1">
                        現有 {item.current_stock}{item.unit} / 最低 {item.min_stock_level}{item.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              待處理訂貨請求
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingOrders.length === 0 ? (
              <p className="text-gray-500 text-sm">目前沒有待處理的訂貨請求</p>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <p className="font-medium">訂貨請求 #{order.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-500">{order.notes || '無備註'}</p>
                    </div>
                    <Badge variant="default">待審批</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
