import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Employee } from '@/types'

interface AuthState {
  user: Employee | null
  setUser: (user: Employee | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null })
        // 登出时清除所有 localStorage 缓存（防止租户数据混用）
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('ultra-pos-')) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
      },
    }),
    {
      name: 'ultra-pos-auth',
    }
  )
)
