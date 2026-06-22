import { Store, Menu } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useRestaurant } from '@/hooks/useSupabaseData'
import PermissionBell from './PermissionBell'
import UserMenu from './UserMenu'

const roleLabels: Record<string, string> = {
  owner: '店主',
  manager: '主管',
  staff: '員工',
}

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user } = useAuthStore()
  const { restaurant } = useRestaurant()

  return (
    <header className="h-14 md:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 md:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* 漢堡選單（手機） */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100"
          aria-label="開啟選單"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        <Store className="h-5 w-5 text-primary shrink-0 hidden sm:block" />
        <span className="text-sm font-medium text-gray-700 truncate max-w-[140px] sm:max-w-none">
          {restaurant?.name || '載入中...'}
        </span>
        <span className="text-[10px] md:text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded-full shrink-0 whitespace-nowrap">
          {user?.role ? roleLabels[user.role] || user.role : ''}
        </span>
      </div>

      <div className="flex items-center gap-1 md:gap-3 shrink-0">
        <PermissionBell />
        <UserMenu />
      </div>
    </header>
  )
}
