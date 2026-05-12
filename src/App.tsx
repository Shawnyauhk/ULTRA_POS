import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { POSPage } from '@/pages/POSPage'
import ExpensesPage from '@/pages/ExpensesPage'
import PayrollPage from '@/pages/PayrollPage'
import SettingsPage from '@/pages/SettingsPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { OrderRequestsPage } from '@/pages/OrderRequestsPage'
import { AIChatPage } from '@/pages/AIChatPage'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // 模擬系統初始化加載
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg font-medium text-gray-700">正在同步雲端數據...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/pos-order" element={<POSPage />} />
                <Route path="/orders" element={<OrderRequestsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/payroll" element={<PayrollPage />} />
                <Route path="/ai-marketing" element={<AIChatPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
