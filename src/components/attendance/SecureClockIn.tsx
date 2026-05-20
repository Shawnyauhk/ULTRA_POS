import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, MapPin, Fingerprint, Shield, CheckCircle2, LogIn, LogOut, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useLocationVerification, type LocationInfo } from '@/hooks/useLocationVerification'
import { useBiometricAuth } from '@/hooks/useBiometricAuth'
import { supabase } from '@/lib/supabase'

type VerificationStep = 'location' | 'biometric' | 'success' | 'setup'
type ClockType = 'in' | 'out'

interface SecureClockInProps {
  onClockSuccess?: () => void
}

/**
 * 安全打卡组件（仅生物认证）
 * 流程：选择上班/下班 → GPS 位置验证 → 指纹/Face ID 验证 → 完成
 */
export function SecureClockIn({ onClockSuccess }: SecureClockInProps) {
  const { user } = useAuthStore()
  const [step, setStep] = useState<VerificationStep>('location')
  const [clockType, setClockType] = useState<ClockType>('in')
  const [location, setLocation] = useState<LocationInfo | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const { loading: locLoading, error: locError, verifyStoreLocation } = useLocationVerification()
  const {
    loading: bioLoading,
    error: bioError,
    supportsWebAuthn,
    hasWebAuthnRegistered,
    registerWebAuthn,
    verifyWebAuthn
  } = useBiometricAuth()

  // ===== 步骤 1：GPS 位置验证 =====
  const handleLocationVerify = useCallback(async () => {
    if (!user?.restaurant_id) return

    const result = await verifyStoreLocation(user.restaurant_id)

    if (result.verified) {
      setLocation(result.location || null)
      setDistance(result.distance || null)
      setStep('biometric')
    } else {
      alert(result.error || '位置驗證失敗')
    }
  }, [user?.restaurant_id, verifyStoreLocation])

  // ===== 步骤 2：指纹/Face ID 验证 =====
  const handleBiometricVerify = useCallback(async () => {
    if (!user?.id) return

    // 检查是否支持 WebAuthn
    if (!supportsWebAuthn()) {
      alert('您的设备不支持指纹或 Face ID 验证。\n请联系管理员使用其他方式打卡。')
      return
    }

    // 检查是否已注册
    const registered = await hasWebAuthnRegistered(user.id)
    if (!registered) {
      setStep('setup')
      return
    }

    const result = await verifyWebAuthn(user.id)

    if (result.success) {
      await doClock(result.method)
    } else {
      alert(result.error || '身份驗證失敗')
    }
  }, [user?.id, supportsWebAuthn, hasWebAuthnRegistered, verifyWebAuthn])

  // ===== 步骤 3：首次注册指纹/Face ID =====
  const handleSetupBiometric = useCallback(async () => {
    if (!user?.id || !user?.name) return

    const result = await registerWebAuthn(user.id, user.name)

    if (result.success) {
      alert('指纹/Face ID 设置成功！')
      const registered = await hasWebAuthnRegistered(user.id)
      if (registered) {
        setStep('biometric')
        // 自动触发验证
        const verifyResult = await verifyWebAuthn(user.id)
        if (verifyResult.success) {
          await doClock(verifyResult.method)
        } else {
          alert(verifyResult.error || '验证失败')
        }
      }
    } else {
      alert(result.error || '设置失败，请重试')
    }
  }, [user?.id, user?.name, registerWebAuthn, hasWebAuthnRegistered, verifyWebAuthn])

  // ===== 完成打卡 =====
  const doClock = useCallback(async (method: string) => {
    if (!user?.id || !user?.restaurant_id) return

    try {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      let clientIP = ''
      try {
        const res = await fetch('https://api.ipify.org?format=json')
        const data = await res.json()
        clientIP = data.ip
      } catch { clientIP = '0.0.0.0' }

      if (clockType === 'in') {
        const { data: attendance, error } = await supabase
          .from('attendance')
          .insert([{
            employee_id: user.id,
            date: today,
            clock_in: timeStr,
            clock_in_latitude: location?.latitude,
            clock_in_longitude: location?.longitude,
            clock_in_ip: clientIP,
            verification_method: method
          }])
          .select()
          .single()

        if (error) throw error

        await supabase.from('attendance_audit_logs').insert([{
          attendance_id: attendance.id,
          employee_id: user.id,
          action: 'clock_in',
          ip_address: clientIP,
          device_info: { user_agent: navigator.userAgent, platform: navigator.platform },
          location_info: location ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy } : null,
          verification_result: { method, passed: true }
        }])
      } else {
        const { data: todayRecord } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', user.id)
          .eq('date', today)
          .is('clock_out', null)
          .single()

        if (!todayRecord) {
          alert('未找到今日上班记录，无法下班打卡')
          return
        }

        const [inH, inM] = (todayRecord.clock_in || '00:00').split(':').map(Number)
        const [outH, outM] = timeStr.split(':').map(Number)
        const workHours = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 100) / 100)

        const { error } = await supabase
          .from('attendance')
          .update({
            clock_out: timeStr,
            work_hours: workHours,
            clock_out_latitude: location?.latitude,
            clock_out_longitude: location?.longitude,
            clock_out_ip: clientIP
          })
          .eq('id', todayRecord.id)

        if (error) throw error

        await supabase.from('attendance_audit_logs').insert([{
          attendance_id: todayRecord.id,
          employee_id: user.id,
          action: 'clock_out',
          ip_address: clientIP,
          device_info: { user_agent: navigator.userAgent, platform: navigator.platform },
          location_info: location ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy } : null,
          verification_result: { method, passed: true }
        }])
      }

      setStep('success')
      onClockSuccess?.()
    } catch (err: any) {
      console.error('打卡失败:', err)
      alert('打卡失败: ' + (err?.message || '未知错误'))
    }
  }, [user?.id, user?.restaurant_id, clockType, location, onClockSuccess])

  // ===== 重置 =====
  const handleReset = useCallback(() => {
    setStep('location')
    setLocation(null)
    setDistance(null)
  }, [])

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">请先登录</CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          安全打卡系统
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ========== 步骤 1：选择类型 + 位置验证 ========== */}
        {step === 'location' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={clockType === 'in' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setClockType('in')}
              >
                <LogIn className="h-4 w-4 mr-2" />
                上班打卡
              </Button>
              <Button
                variant={clockType === 'out' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setClockType('out')}
              >
                <LogOut className="h-4 w-4 mr-2" />
                下班打卡
              </Button>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
              <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span>步骤 1/2：验证位置 — 确保您在店铺范围内</span>
            </div>

            <Button
              onClick={handleLocationVerify}
              disabled={locLoading}
              className="w-full"
              size="lg"
            >
              {locLoading ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <MapPin className="h-5 w-5 mr-2" />
              )}
              验证我的位置
            </Button>

            {locError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{locError}</div>
            )}
          </div>
        )}

        {/* ========== 步骤 2：指纹/Face ID 验证 ========== */}
        {step === 'biometric' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>
                位置验证通过
                {distance !== null && `（距离店铺约 ${distance} 公尺）`}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">
              <Fingerprint className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <span>步骤 2/2：生物识别 — 按指纹或扫脸确认本人操作</span>
            </div>

            {!supportsWebAuthn() ? (
              /* 设备不支持 */
              <div className="text-center space-y-3 py-4">
                <AlertTriangle className="h-12 w-12 mx-auto text-orange-500" />
                <p className="font-medium text-gray-700">设备不支持生物识别</p>
                <p className="text-sm text-gray-500">
                  您的手机不支持指纹或 Face ID 验证。<br />
                  请联系管理员或使用店内的专用打卡设备。
                </p>
                <Button variant="outline" onClick={handleReset} className="w-full">
                  返回
                </Button>
              </div>
            ) : (
              /* 设备支持 — 验证 */
              <Button
                onClick={handleBiometricVerify}
                disabled={bioLoading}
                className="w-full"
                size="lg"
              >
                {bioLoading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Fingerprint className="h-5 w-5 mr-2" />
                )}
                指纹/Face ID 验证
              </Button>
            )}

            {bioError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{bioError}</div>
            )}
          </div>
        )}

        {/* ========== 步骤：首次设置 ========== */}
        {step === 'setup' && (
          <div className="space-y-4 text-center">
            <Shield className="h-14 w-14 mx-auto text-blue-500" />
            <div>
              <p className="font-medium text-lg">首次使用安全打卡</p>
              <p className="text-sm text-gray-500 mt-1">
                需要注册您的指纹或 Face ID<br />
                以后打卡只需按一下，既安全又快捷
              </p>
            </div>

            {!supportsWebAuthn() ? (
              <div className="space-y-3 py-2">
                <AlertTriangle className="h-12 w-12 mx-auto text-orange-500" />
                <p className="font-medium text-gray-700">设备不支持生物识别</p>
                <p className="text-sm text-gray-500">
                  请使用支持指纹/Face ID 的手机，<br />
                  或联系管理员安排打卡设备。
                </p>
                <Button variant="outline" onClick={handleReset} className="w-full">
                  返回
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleSetupBiometric}
                disabled={bioLoading}
                className="w-full"
                size="lg"
              >
                {bioLoading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Fingerprint className="h-5 w-5 mr-2" />
                )}
                注册指纹/Face ID
              </Button>
            )}
          </div>
        )}

        {/* ========== 成功 ========== */}
        {step === 'success' && (
          <div className="text-center py-4 space-y-4">
            <div className="text-green-500">
              <CheckCircle2 className="h-16 w-16 mx-auto" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-700">
                {clockType === 'in' ? '上班打卡成功！' : '下班打卡成功！'}
              </p>
              <p className="text-gray-500 mt-1">
                {new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {distance !== null && (
                <p className="text-sm text-gray-400">距离店铺: {distance} 公尺</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                {clockType === 'in' ? '再打下班卡' : '再打上班卡'}
              </Button>
              <Button onClick={() => setStep('location')} className="flex-1">
                完成
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
