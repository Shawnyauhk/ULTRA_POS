import { Bell, LogOut, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useRestaurant } from '@/hooks/useSupabaseData'
import { supabase } from '@/lib/supabase'

export function TopBar() {
  const { user, logout } = useAuthStore()
  const { restaurant } = useRestaurant()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    logout()
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Store className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium text-gray-700">
          {restaurant?.name || '載入中...'}
        </span>
        <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">
          {user?.role === 'owner' ? '店主' : user?.role === 'manager' ? '主管' : '員工'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="登出">
          <LogOut className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-medium">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden md:block">{user?.name}</span>
        </div>
      </div>
    </header>
  )
}
