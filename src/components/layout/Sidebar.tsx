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
  Megaphone,
  Settings,
  BarChart3
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

const menuItems = [
  { path: '/', label: '控制面板與AI分析', icon: LayoutDashboard },
  { path: '/pos-order', label: 'POS 點餐系統', icon: ShoppingBag },
  { path: '/orders', label: '訂貨管理', icon: Receipt },
  { path: '/products', label: '產品管理', icon: Coffee },
  { path: '/inventory', label: '庫存與補貨', icon: Package },
  { path: '/expenses', label: '財務、支出與結算', icon: Calculator },
  { path: '/payroll', label: '員工與薪酬', icon: Users },
  { path: '/ai-marketing', label: 'AI 行銷與客服', icon: Megaphone },
  { path: '/settings', label: '系統設置', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { user } = useAuthStore()

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
          <p className="font-semibold text-gray-900">Multi-Tenant SaaS</p>
          <p className="text-xs">總店 - 管理後台</p>
          {user && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-xs">{user.role === 'owner' ? '店主' : user.role === 'manager' ? '主管' : '員工'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
