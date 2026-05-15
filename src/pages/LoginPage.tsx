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
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 用电话号作为内部email格式 {phone}@ultrapos.com
      const email = `${phone}@ultrapos.com`

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      // 查找员工记录
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('phone', phone)
        .single()

      if (empError || !employee) {
        throw new Error('找不到對應的員工資料')
      }

      if (!employee.is_active) {
        throw new Error('此帳號已被停用')
      }

      setUser(employee)
      navigate('/')
    } catch (err: unknown) {
      const message = err && typeof err === 'object'
        ? String((err as Record<string, unknown>).message ?? err)
        : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
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
              <label className="text-sm font-medium">電話號碼</label>
              <Input
                type="tel"
                placeholder="請輸入電話號碼"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
        </CardContent>
      </Card>
    </div>
  )
}
