import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock, LogIn, LogOut, User, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useEmployees, useAttendance } from '@/hooks/useSupabaseData'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types'

export function AttendancePage() {
  const { user } = useAuthStore()
  const { employees, loading: empLoading } = useEmployees()
  const { attendance, loading, refetch, addAttendance, updateAttendance, getTodayAttendance } = useAttendance()
  const [todayAttendance, setTodayAttendance] = useState<any[]>([])
  const [clockingIn, setClockingIn] = useState<string | null>(null)
  const [clockingOut, setClockingOut] = useState<string | null>(null)

  const refreshToday = useCallback(async () => {
    const today = await getTodayAttendance()
    setTodayAttendance(today)
  }, [getTodayAttendance])

  useEffect(() => {
    refreshToday()
  }, [attendance, refreshToday])

  // 檢查是否在店舖範圍內（經緯度距離）
  const checkStoreProximity = async (): Promise<boolean> => {
    try {
      // 從設定中讀取店舖位置
      const { data: settings } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', 'store_location')
        .single();

      if (!settings?.setting_value) {
        // 沒有設定位置，跳過檢查
        return true;
      }

      const storeLoc = JSON.parse(settings.setting_value); // { lat, lng }

      // 取得當前位置
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;

      // 計算距離（Haversine 公式）
      const R = 6371000; // 地球半徑（公尺）
      const dLat = (userLat - storeLoc.lat) * Math.PI / 180;
      const dLng = (userLng - storeLoc.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(storeLoc.lat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
                Math.sin(dLng / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // 200 公尺內視為在店舖
      if (distance > 200) {
        alert(`⚠️ 您目前距離店舖約 ${Math.round(distance)} 公尺，請到店舖後再打卡。`);
        return false;
      }
      return true;
    } catch (err) {
      // GPS 不可用時允許打卡（開發階段）
      console.warn('位置檢查失敗，跳過:', err);
      return true;
    }
  };

  const handleClockIn = async (employeeId: string) => {
    // 位置檢查
    const inStore = await checkStoreProximity();
    if (!inStore) return;

    setClockingIn(employeeId)
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    try {
      const { error } = await supabase
        .from('attendance')
        .insert([{
          employee_id: employeeId,
          date: today,
          clock_in: timeStr,
        }])

      if (error) throw error
      await refreshToday()
    } catch (err) {
      console.error('Clock in error:', err)
      alert('打卡失敗: ' + (err as Error).message)
    } finally {
      setClockingIn(null)
    }
  }

  const handleClockOut = async (attendanceId: string) => {
    setClockingOut(attendanceId)
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    try {
      const record = todayAttendance.find(a => a.id === attendanceId)
      // Calculate work hours from time strings
      let workHours = 0
      if (record?.clock_in) {
        const [inH, inM] = record.clock_in.split(':').map(Number)
        const [outH, outM] = timeStr.split(':').map(Number)
        workHours = Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 100) / 100
      }

      const { error } = await supabase
        .from('attendance')
        .update({
          clock_out: timeStr,
          work_hours: Math.max(0, workHours),
        })
        .eq('id', attendanceId)

      if (error) throw error
      await refreshToday()
    } catch (err) {
      console.error('Clock out error:', err)
      alert('下班打卡失敗: ' + (err as Error).message)
    } finally {
      setClockingOut(null)
    }
  }

  const getAttendanceForEmployee = (employeeId: string) => {
    return todayAttendance.find((a: any) => a.employee_id === employeeId)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">打卡系統</h1>
        <p className="text-gray-500 mt-1">員工上下班打卡記錄</p>
      </div>

      {/* Quick Clock In/Out */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            快速打卡
          </CardTitle>
        </CardHeader>
        <CardContent>
          {empLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {employees.filter(e => e.is_active).map((employee) => {
                const att = getAttendanceForEmployee(employee.id)
                const hasClockIn = !!att?.clock_in
                const hasClockOut = !!att?.clock_out

                return (
                  <div key={employee.id} className="border rounded-lg p-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-gray-200 mx-auto mb-2 flex items-center justify-center">
                      <User className="h-6 w-6 text-gray-500" />
                    </div>
                    <p className="font-medium">{employee.name}</p>
                    <p className="text-sm text-gray-500 mb-3">
                      {employee.role === 'owner' ? '店主' : employee.role === 'manager' ? '主管' : '員工'}
                    </p>
                    {hasClockOut ? (
                      <Badge variant="success" className="w-full justify-center">已下班</Badge>
                    ) : hasClockIn ? (
                      <div className="space-y-2">
                        <p className="text-sm text-green-600">上班: {att?.clock_in}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleClockOut(att!.id)}
                          disabled={clockingOut === att!.id}
                        >
                          {clockingOut === att!.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4 mr-1" />
                          )}
                          下班
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleClockIn(employee.id)}
                        disabled={clockingIn === employee.id}
                      >
                        {clockingIn === employee.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <LogIn className="h-4 w-4 mr-1" />
                        )}
                        上班
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Records */}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>員工</TableHead>
                  <TableHead>上班時間</TableHead>
                  <TableHead>下班時間</TableHead>
                  <TableHead>工時</TableHead>
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
                      <Badge variant={record.clock_out ? 'success' : 'warning'}>
                        {record.clock_out ? '已完成' : '工作中'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
