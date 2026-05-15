import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/hooks/usePermission'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { LoginPage } from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { POSPage } from '@/pages/POSPage'
import ExpensesPage from '@/pages/ExpensesPage'
import PayrollPage from '@/pages/PayrollPage'
import SettingsPage from '@/pages/SettingsPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { OrderRequestsPage } from '@/pages/OrderRequestsPage'
import { AIChatPage } from '@/pages/AIChatPage'
import { AICustomerChat } from '@/pages/AICustomerChat'
import ReviewGeneratorPage from '@/pages/ReviewGeneratorPage'
import PermissionSettingsPage from '@/pages/PermissionSettingsPage'
import { EmployeesPage } from '@/pages/EmployeesPage'
import { AttendancePage } from '@/pages/AttendancePage'
import { SchedulesPage } from '@/pages/SchedulesPage'
import ReportsPage from '@/pages/ReportsPage'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { PermissionKey } from '@/types'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** 权限路由守卫：没有对应权限时重定向到首页 */
function PermissionGuard({ permission, children }: { permission: PermissionKey; children: React.ReactNode }) {
  const { can } = usePermission()
  if (!can(permission)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

const routePermissions: Record<string, PermissionKey> = {
  '/pos-order': 'pos.create_order',
  '/products': 'product.view',
  '/inventory': 'inventory.view',
  '/orders': 'order.view',
  '/employees': 'employee.view',
  '/attendance': 'attendance.view',
  '/schedules': 'schedule.view',
  '/payroll': 'payroll.view',
  '/expenses': 'expense.view',
  '/reports': 'report.view',
  '/ai-marketing': 'ai.customer_service',
  '/review-generator': 'review.view',
  '/settings': 'setting.view',
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
    // 實際初始化加載
    setIsInitializing(false);
  }, []);

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg font-medium text-gray-700">正在同步雲端數據...</p>
      </div>
    );
  }

  const renderProtectedRoute = (path: string, element: React.ReactNode) => {
    const perm = routePermissions[path]
    if (perm) {
      return <Route path={path} element={<PermissionGuard permission={perm}>{element}</PermissionGuard>} />
    }
    return <Route path={path} element={element} />
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/ai-customer-chat" element={<AICustomerChat />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                {renderProtectedRoute('/', <DashboardPage />)}
                {renderProtectedRoute('/pos-order', <POSPage />)}
                {renderProtectedRoute('/orders', <OrderRequestsPage />)}
                {renderProtectedRoute('/products', <ProductsPage />)}
                {renderProtectedRoute('/inventory', <InventoryPage />)}
                {renderProtectedRoute('/employees', <EmployeesPage />)}
                {renderProtectedRoute('/attendance', <AttendancePage />)}
                {renderProtectedRoute('/schedules', <SchedulesPage />)}
                {renderProtectedRoute('/reports', <ReportsPage />)}
                {renderProtectedRoute('/expenses', <ExpensesPage />)}
                {renderProtectedRoute('/payroll', <PayrollPage />)}
                {renderProtectedRoute('/ai-marketing', <AIChatPage />)}
                {renderProtectedRoute('/review-generator', <ReviewGeneratorPage />)}
                {renderProtectedRoute('/permissions', <PermissionSettingsPage />)}
                {renderProtectedRoute('/settings', <SettingsPage />)}
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
