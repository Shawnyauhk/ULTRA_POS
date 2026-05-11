import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Fetch employee profile
      const { data: employee } = await supabase
        .from('employees')
        .select('*')
        .eq('email', email)
        .single()

      if (employee) {
        setUser(employee)
        navigate('/')
      } else {
        // Create demo user if not found
        setUser({
          id: data.user.id,
          restaurant_id: 'demo',
          name: '示範用戶',
          email: email,
          role: 'owner',
          hire_date: new Date().toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
        })
        navigate('/')
      }
    } catch (err: any) {
      setError(err.message || '登入失敗')
    } finally {
      setLoading(false)
    }
  }

  // Demo login for testing without Supabase
  const handleDemoLogin = () => {
    setUser({
      id: 'demo-1',
      restaurant_id: 'demo',
      name: '示範用戶',
      email: 'demo@demo.com',
      role: 'owner',
      hire_date: new Date().toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    })
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">ULTRA_POS</CardTitle>
          <CardDescription className="text-center">
            餐廳後台管理系統
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">電子郵件</label>
              <Input
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">密碼</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登入中...' : '登入'}
            </Button>
          </form>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDemoLogin}
            >
              示範模式（無需設定）
            </Button>
            <p className="text-xs text-gray-500 text-center mt-2">
              示範模式可在未設定 Supabase 的情況下預覽系統
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
