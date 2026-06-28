import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Calculator, ShoppingBag, Package, Coffee,
  Receipt, Users, MessageSquare, Star, Settings, Shield,
  BarChart3, Clock, CalendarDays, DollarSign, Store, Smartphone, X, UserCog, ChefHat,
  ClipboardList, Box, Wallet
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useRestaurant } from '@/hooks/useSupabaseData'
import { usePermission } from '@/hooks/usePermission'
import type { PermissionKey } from '@/types'
import { useEffect } from 'react'

interface MenuItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission: PermissionKey
}

const menuItems: MenuItem[] = [
  { path: '/', label: '控制面板與AI分析', icon: LayoutDashboard, permission: 'dashboard.view' },

  // POS / 銷售
  { path: '/pos-order', label: 'POS 點餐系統', icon: ShoppingBag, permission: 'pos.create_order' },
  { path: '/orders', label: '訂貨管理', icon: Receipt, permission: 'order.view' },

  // 產品 / 庫存
  { path: '/products', label: '產品管理', icon: ClipboardList, permission: 'product.view' },
  { path: '/inventory', label: '庫存管理', icon: Box, permission: 'inventory.view' },

  // 人事
  { path: '/hr', label: '員工與排班', icon: UserCog, permission: 'employee.view' },
  { path: '/attendance', label: '打卡系統', icon: Clock, permission: 'attendance.view' },
  { path: '/payroll', label: '薪酬管理', icon: Wallet, permission: 'payroll.view' },

  // 財務
  { path: '/expenses', label: '門店支出', icon: Calculator, permission: 'expense.view' },
  { path: '/settlement', label: '營業額結算', icon: DollarSign, permission: 'settlement.view' },
  { path: '/reports', label: '報表', icon: BarChart3, permission: 'report.view' },

  // AI / 評價
  { path: '/ai-customer-service', label: 'AI 客服管理', icon: MessageSquare, permission: 'ai.customer_service' },
  { path: '/review-generator', label: 'Google 好評', icon: Star, permission: 'review.view' },

  // 設定
  { path: '/settings', label: '系統設置', icon: Settings, permission: 'setting.view' },
]

const roleLabels: Record<string, string> = {
  owner: '店主',
  manager: '主管',
  staff: '員工',
}

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuthStore()
  const { restaurant } = useRestaurant()
  const { can } = usePermission()

  const filteredItems = menuItems.filter((item) => can(item.permission))

  // 切換頁面時自動關閉手機側邊欄
  useEffect(() => {
    onClose()
  }, [location.pathname])

  const sidebarContent = (
    <>
      {/* 頂部標題 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 safe-area-top">
        <div>
          <h1 className="text-lg font-bold text-primary">ULTRA_POS</h1>
          <p className="text-xs text-gray-500">餐廳後台管理系統</p>
        </div>
        {/* 手機關閉按鈕 */}
        <button onClick={onClose} className="md:hidden p-1 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 導航選單 */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {filteredItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            )
          })}
          {/* 秘傳配方 - 僅店主可見 */}
          {user?.role === 'owner' && (
            <li>
              <Link
                to="/secret-recipes"
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === '/secret-recipes'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-700 hover:bg-amber-50'
                )}
              >
                <ChefHat className="h-5 w-5 shrink-0" />
                <span className="truncate">秘傳配方</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* 底部用戶資訊 */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Store className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {restaurant?.name || '載入中...'}
            </p>
            {restaurant?.business_hours && (
              <p className="text-xs text-gray-400">{restaurant.business_hours}</p>
            )}
          </div>
        </div>
        {user && (
          <div className="pt-3 border-t border-gray-200">
            <p className="font-medium text-gray-900 text-sm truncate">{user.name}</p>
            <p className="text-xs text-gray-500">
              {roleLabels[user.role] || user.role}
            </p>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* 手機：overlay 背景 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* 桌面版：固定的側邊欄 */}
      <aside className="hidden md:flex md:w-56 lg:w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* 手機版：滑出的側邊欄 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl flex flex-col transition-transform duration-300 md:hidden safe-area-bottom',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
