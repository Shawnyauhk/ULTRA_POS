import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EmployeesPage } from '@/pages/EmployeesPage'
import { AttendancePage } from '@/pages/AttendancePage'
import { SchedulesPage } from '@/pages/SchedulesPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { OrderRequestsPage } from '@/pages/OrderRequestsPage'
import { ProductsPage } from '@/pages/ProductsPage'
import ExpensesPage from '@/pages/ExpensesPage'
import ReportsPage from '@/pages/ReportsPage'
import { AIChatPage } from '@/pages/AIChatPage'

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
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/orders" element={<OrderRequestsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/ai-chat" element={<AIChatPage />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
