import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Calculator,
  ShoppingBag,
  Package,
  Coffee,
  Receipt,
  Users,
  MessageSquare,
  Star,
  Settings,
  BarChart3,
  Clock,
  CalendarDays,
  Store
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useRestaurant } from '@/hooks/useSupabaseData'

const menuItems = [
  { path: '/', label: '控制面板與AI分析', icon: LayoutDashboard },
  { path: '/pos-order', label: 'POS 點餐系統', icon: ShoppingBag },
  { path: '/products', label: '產品管理', icon: Coffee },
  { path: '/inventory', label: '貨物表', icon: Package },
  { path: '/orders', label: '訂貨管理', icon: Receipt },
  { path: '/attendance', label: '打卡系統', icon: Clock },
  { path: '/schedules', label: '排班管理', icon: CalendarDays },
  { path: '/payroll', label: '員工與薪酬', icon: Users },
  { path: '/expenses', label: '財務、支出與結算', icon: Calculator },
  { path: '/reports', label: '數據報表', icon: BarChart3 },
  { path: '/ai-marketing', label: 'AI 客服', icon: MessageSquare },
  { path: '/review-generator', label: 'Google 好評', icon: Star },
  { path: '/settings', label: '系統設置', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { user } = useAuthStore()
  const { restaurant } = useRestaurant()

  const filteredItems = menuItems.filter((item) => {
    if (!item.roles) return true
    return user && item.roles.includes(user.role)
  })

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-primary">ULTRA_POS</h1>
        <p className="text-sm text-gray-500">餐廳後台管理系統</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          {/* 餐廳資訊 */}
          <div className="flex items-center gap-2 mb-3">
            <Store className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">
                {restaurant?.name || '載入中...'}
              </p>
              {restaurant?.business_hours && (
                <p className="text-xs text-gray-400">{restaurant.business_hours}</p>
              )}
            </div>
          </div>
          {/* 用戶資訊 */}
          {user && (
            <div className="pt-3 border-t border-gray-200">
              <p className="font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs">
                {user.role === 'owner' ? '店主' : user.role === 'manager' ? '主管' : '員工'}
                <span className="ml-2 text-gray-400">ID: {user.restaurant_id?.slice(0, 8)}...</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
