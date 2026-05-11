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
      logout: () => set({ user: null }),
    }),
    {
      name: 'ultra-pos-auth',
    }
  )
)
