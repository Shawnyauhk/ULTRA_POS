import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, Loader2, Shield, ScanLine, Smartphone, Wifi, FileText, Inbox } from 'lucide-react'
import { WiFiClockIn } from '@/components/attendance/WiFiClockIn'
import { useAuthStore } from '@/stores/auth'
import { useAttendance } from '@/hooks/useSupabaseData'
import { supabase } from '@/lib/supabase'
import { SecureClockIn } from '@/components/attendance/SecureClockIn'
import { QRCodeScanner } from '@/components/attendance/QRCodeScanner'
import { CorrectionRequest } from '@/components/attendance/CorrectionRequest'
import { CorrectionReview } from '@/components/attendance/CorrectionReview'

export function AttendancePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore()
  const { getTodayAttendance } = useAttendance()
  const [showSecureClockIn, setShowSecureClockIn] = useState(false)
  const [showQRClock, setShowQRClock] = useState(false)
  const [showWiFiClock, setShowWiFiClock] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const canManage = user?.role === 'owner' || user?.role === 'manager'

  const refreshToday = useCallback(async () => {
    await getTodayAttendance()
  }, [getTodayAttendance])

  useEffect(() => {
    if (!user?.restaurant_id || !canManage) return
    supabase
      .from('attendance_corrections')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count || 0))
  }, [user?.restaurant_id, canManage])

  return (
    <div className="p-3 md:p-6 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900">打卡系統</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/attendance-device')}>
          <Smartphone className="w-4 h-4 mr-1.5" />
          打卡裝置
        </Button>
      </div>

      {showQRClock ? (
        <QRCodeScanner onSuccess={() => { setShowQRClock(false); refreshToday(); }} />
      ) : showSecureClockIn ? (
        <SecureClockIn onClockSuccess={() => { setShowSecureClockIn(false); refreshToday(); }} />
      ) : showWiFiClock ? (
        <WiFiClockIn onSuccess={() => { setShowWiFiClock(false); refreshToday(); }} />
      ) : showCorrection ? (
        <div>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => setShowCorrection(false)}>← 返回</Button>
          <CorrectionRequest onRequestSubmitted={() => refreshToday()} />
        </div>
      ) : showReview ? (
        <div>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => setShowReview(false)}>← 返回</Button>
          <CorrectionReview />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <Button onClick={() => setShowWiFiClock(true)} className="h-24 flex flex-col gap-2 bg-green-600 hover:bg-green-700">
            <Wifi className="h-6 w-6" />
            <span className="text-sm">WiFi 打卡</span>
          </Button>
          <Button onClick={() => setShowQRClock(true)} className="h-24 flex flex-col gap-2">
            <ScanLine className="h-6 w-6" />
            <span className="text-sm">掃碼打卡</span>
          </Button>
          <Button onClick={() => setShowSecureClockIn(true)} variant="outline" className="h-24 flex flex-col gap-2">
            <Shield className="h-6 w-6" />
            <span className="text-sm">備用打卡</span>
          </Button>
          <Button onClick={() => setShowCorrection(true)} variant="outline" className="h-24 flex flex-col gap-2">
            <FileText className="h-6 w-6" />
            <span className="text-sm">補打卡</span>
          </Button>
          {canManage && (
            <Button onClick={() => setShowReview(true)} className="h-24 flex flex-col gap-2 relative">
              <Inbox className="h-6 w-6" />
              <span className="text-sm">審批</span>
              {pendingCount > 0 && (
                <Badge className="absolute top-2 right-2 bg-red-500 text-white text-[10px] px-1.5 py-0">{pendingCount}</Badge>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
