import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    restaurantName: '',
    ownerName: '',
    phone: '',
  })

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 基本驗證
    if (!formData.email || !formData.password || !formData.restaurantName) {
      setError('請填寫電子郵件、密碼和餐廳名稱')
      return
    }
    if (formData.password.length < 6) {
      setError('密碼長度至少 6 個字元')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          restaurantName: formData.restaurantName,
          ownerName: formData.ownerName || undefined,
          phone: formData.phone || undefined,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.message || '註冊失敗')
      }

      setStep('success')
    } catch (err: any) {
      setError(err.message || '註冊失敗，請確認後端伺服器已啟動 (node server.js)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-lg">
        {step === 'form' ? (
          <>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="icon" onClick={() => navigate('/login')} className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-2xl font-bold text-center">註冊新商家</CardTitle>
              <CardDescription className="text-center">
                建立您的餐廳帳號，開始使用 ULTRA_POS 管理系統
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md border border-red-200">
                    {error}
                  </div>
                )}

                {/* 餐廳資訊 */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800 mb-3">餐廳資訊</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">餐廳名稱 *</label>
                      <Input
                        value={formData.restaurantName}
                        onChange={(e) => handleChange('restaurantName', e.target.value)}
                        placeholder="例如：家傳x飲得"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">管理員姓名</label>
                      <Input
                        value={formData.ownerName}
                        onChange={(e) => handleChange('ownerName', e.target.value)}
                        placeholder="您的姓名（可選）"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">聯絡電話</label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="香港手機號碼（可選）"
                      />
                    </div>
                  </div>
                </div>

                {/* 帳號資訊 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800 mb-3">帳號資訊</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">電子郵件 *</label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="example@email.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">密碼 *</label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleChange('password', e.target.value)}
                        placeholder="至少 6 個字元"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">確認密碼 *</label>
                      <Input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => handleChange('confirmPassword', e.target.value)}
                        placeholder="再次輸入密碼"
                        required
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />註冊中...</>
                  ) : (
                    '註冊新商家'
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center mt-2">
                  註冊即表示您同意我們的服務條款和隱私政策
                </p>
              </form>

              <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-500">
                  已經有帳號？{' '}
                  <Link to="/login" className="text-primary font-medium hover:underline">
                    返回登入
                  </Link>
                </p>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-center">註冊成功！</CardTitle>
              <CardDescription className="text-center">
                您的餐廳 <strong>{formData.restaurantName}</strong> 已建立完成
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 rounded-lg p-4 text-sm text-green-800 space-y-2">
                <p>✅ 已建立管理員帳號</p>
                <p>✅ 已建立餐廳基本資料</p>
                <p>✅ 已建立 11 個預設分類</p>
              </div>
              <p className="text-sm text-gray-500 text-center">
                請使用您的 email 和密碼登入系統。
                <br />
                登入後即可開始設定員工、產品和庫存。
              </p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                前往登入
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
