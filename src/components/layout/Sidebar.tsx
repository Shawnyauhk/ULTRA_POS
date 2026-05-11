import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Package,
  ShoppingCart,
  Coffee,
  Receipt,
  BarChart3,
  MessageSquare,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

const menuItems = [
  { path: '/', label: '儀表板', icon: LayoutDashboard },
  { path: '/employees', label: '員工管理', icon: Users, roles: ['owner', 'manager'] },
  { path: '/attendance', label: '打卡記錄', icon: Clock },
  { path: '/schedules', label: '排班管理', icon: CalendarDays },
  { path: '/inventory', label: '倉庫存貨', icon: Package },
  { path: '/orders', label: '訂貨管理', icon: ShoppingCart },
  { path: '/products', label: '產品管理', icon: Coffee, roles: ['owner', 'manager'] },
  { path: '/expenses', label: '支出記帳', icon: Receipt, roles: ['owner', 'manager'] },
  { path: '/reports', label: '數據報表', icon: BarChart3, roles: ['owner', 'manager'] },
  { path: '/ai-chat', label: 'AI 客服', icon: MessageSquare },
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
          {user && (
            <div>
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-xs">{user.role === 'owner' ? '店主' : user.role === 'manager' ? '主管' : '員工'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
