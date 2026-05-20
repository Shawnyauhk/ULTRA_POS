import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock, Loader2, Shield, Fingerprint, Key, MapPin, FileText, Inbox } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useAttendance } from '@/hooks/useSupabaseData'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types'
import { SecureClockIn } from '@/components/attendance/SecureClockIn'
import { CorrectionRequest } from '@/components/attendance/CorrectionRequest'
import { CorrectionReview } from '@/components/attendance/CorrectionReview'

export function AttendancePage() {
  const { user } = useAuthStore()
  const { attendance, loading, refetch, addAttendance, updateAttendance, getTodayAttendance } = useAttendance()
  const [todayAttendance, setTodayAttendance] = useState<any[]>([])
  const [showSecureClockIn, setShowSecureClockIn] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const canManage = user?.role === 'owner' || user?.role === 'manager'

  const refreshToday = useCallback(async () => {
    const today = await getTodayAttendance()
    setTodayAttendance(today)
  }, [getTodayAttendance])

  useEffect(() => {
    refreshToday()
  }, [attendance, refreshToday])

  // 加载待审核数量
  useEffect(() => {
    if (!user?.restaurant_id || !canManage) return
    supabase
      .from('attendance_corrections')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count || 0))
  }, [user?.restaurant_id, canManage])

  // 验证方式徽章
  const getVerificationBadge = (method: string | undefined) => {
    if (!method || method === 'manual') return null
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
        {method === 'webauthn' ? (
          <><Fingerprint className="h-3 w-3" /> 指紋</>
        ) : (
          <><Key className="h-3 w-3" /> PIN</>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">打卡系統</h1>
        <p className="text-gray-500 mt-1">員工上下班安全打卡記錄</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ====== 左栏：安全打卡 + 我的状态 ====== */}
        <div className="space-y-4">
          {showSecureClockIn ? (
            <SecureClockIn onClockSuccess={() => refreshToday()} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  安全打卡
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="text-sm text-gray-600 space-y-2">
                  <p className="flex items-center justify-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    GPS 位置验证（店铺200公尺内）
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    <Fingerprint className="h-4 w-4 text-green-500" />
                    指纹 / Face ID 验证（本人）
                  </p>
                </div>
                <Button onClick={() => setShowSecureClockIn(true)} size="lg" className="w-full">
                  <Shield className="h-5 w-5 mr-2" />
                  我要打卡
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 我的打卡状态 */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">我的打卡狀態</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const myRecord = todayAttendance.find((a: any) => a.employee_id === user.id)
                  if (!myRecord) {
                    return <p className="text-gray-400 text-sm text-center py-2">今日尚未打卡</p>
                  }
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">上班時間</span>
                        <span className="font-medium">{myRecord.clock_in || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">下班時間</span>
                        <span className="font-medium">{myRecord.clock_out || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">驗證方式</span>
                        <span>{getVerificationBadge(myRecord.verification_method)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">狀態</span>
                        <Badge variant={myRecord.clock_out ? 'success' : 'warning'}>
                          {myRecord.clock_out ? '已完成' : '工作中'}
                        </Badge>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ====== 右栏：补打卡系统 ====== */}
        <div className="space-y-4">
          {/* 补打卡入口 */}
          {!showCorrection && !showReview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  补打卡
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-500">
                  忘记打卡或手机故障？通过补打卡申请来补录记录。
                </p>

                <Button
                  onClick={() => setShowCorrection(true)}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  提交补打卡申请
                </Button>

                {canManage && (
                  <Button
                    onClick={() => setShowReview(true)}
                    className="w-full justify-start"
                  >
                    <Inbox className="h-4 w-4 mr-2" />
                    审核补打卡申请
                    {pendingCount > 0 && (
                      <span className="ml-auto bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* 补打卡申请表单 + 记录 */}
          {showCorrection && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2"
                onClick={() => setShowCorrection(false)}
              >
                ← 返回
              </Button>
              <CorrectionRequest onRequestSubmitted={() => refreshToday()} />
            </div>
          )}

          {/* 补打卡审核面板 */}
          {showReview && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2"
                onClick={() => setShowReview(false)}
              >
                ← 返回
              </Button>
              <CorrectionReview />
            </div>
          )}
        </div>
      </div>

      {/* 今日打卡記錄 */}
      <Card>
        <CardHeader>
          <CardTitle>今日打卡記錄</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : todayAttendance.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>今日尚無打卡記錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>員工</TableHead>
                    <TableHead>上班時間</TableHead>
                    <TableHead>下班時間</TableHead>
                    <TableHead>工時</TableHead>
                    <TableHead>驗證</TableHead>
                    <TableHead>位置</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayAttendance.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.employee?.name || '未知'}
                      </TableCell>
                      <TableCell>{record.clock_in || '-'}</TableCell>
                      <TableCell>{record.clock_out || '-'}</TableCell>
                      <TableCell>{record.work_hours ? `${record.work_hours} 小時` : '-'}</TableCell>
                      <TableCell>
                        {getVerificationBadge(record.verification_method) || '-'}
                      </TableCell>
                      <TableCell>
                        {record.clock_in_latitude ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <MapPin className="h-3 w-3" /> 已驗證
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.clock_out ? 'success' : 'warning'}>
                          {record.clock_out ? '已完成' : '工作中'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
