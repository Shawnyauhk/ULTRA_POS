import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock, LogIn, LogOut, User } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { calculateWorkHours } from '@/lib/utils'
import type { Attendance, Employee } from '@/types'

export function AttendancePage() {
  const _auth = useAuthStore() // TODO: Connect to Supabase
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading] = useState(true)

  useEffect(() => {
    // Demo data
    setEmployees([
      { id: '1', restaurant_id: 'demo', name: '張三', role: 'owner', hire_date: '2024-01-01', is_active: true, created_at: '2024-01-01' },
      { id: '2', restaurant_id: 'demo', name: '李四', role: 'manager', hire_date: '2024-03-15', is_active: true, created_at: '2024-03-15' },
      { id: '3', restaurant_id: 'demo', name: '王五', role: 'staff', hire_date: '2024-06-01', is_active: true, created_at: '2024-06-01' },
    ])
    setTodayAttendance([
      { id: '1', employee_id: '1', date: new Date().toISOString(), clock_in: '09:00', employee: employees[0] },
      { id: '2', employee_id: '2', date: new Date().toISOString(), clock_in: '10:00', employee: employees[1] },
      { id: '3', employee_id: '1', date: new Date().toISOString(), clock_out: '18:00', employee: employees[0] },
    ])
    // Demo data loaded
  }, [])

  const handleClockIn = (employeeId: string) => {
    const newRecord: Attendance = {
      id: Date.now().toString(),
      employee_id: employeeId,
      date: new Date().toISOString(),
      clock_in: new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }),
    }
    setTodayAttendance([...todayAttendance, newRecord])
  }

  const handleClockOut = (attendanceId: string) => {
    setTodayAttendance(todayAttendance.map(record => {
      if (record.id === attendanceId) {
        const clockOutTime = new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })
        const workHours = record.clock_in
          ? calculateWorkHours(record.clock_in, clockOutTime)
          : 0
        return {
          ...record,
          clock_out: clockOutTime,
          work_hours: workHours,
        }
      }
      return record
    }))
  }

  const getAttendanceForEmployee = (employeeId: string) => {
    return todayAttendance.find(a => a.employee_id === employeeId)
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {employees.filter(e => e.is_active).map((employee) => {
              const attendance = getAttendanceForEmployee(employee.id)
              const hasClockIn = !!attendance?.clock_in
              const hasClockOut = !!attendance?.clock_out

              return (
                <div key={employee.id} className="border rounded-lg p-4 text-center">
                  <div className="h-12 w-12 rounded-full bg-gray-200 mx-auto mb-2 flex items-center justify-center">
                    <User className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="font-medium">{employee.name}</p>
                  <p className="text-sm text-gray-500 mb-3">{employee.role === 'owner' ? '店主' : employee.role === 'manager' ? '主管' : '員工'}</p>
                  {hasClockOut ? (
                    <Badge variant="success" className="w-full justify-center">已下班</Badge>
                  ) : hasClockIn ? (
                    <div className="space-y-2">
                      <p className="text-sm text-green-600">上班: {attendance?.clock_in}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => handleClockOut(attendance!.id)}
                      >
                        <LogOut className="h-4 w-4 mr-1" />
                        下班
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleClockIn(employee.id)}
                    >
                      <LogIn className="h-4 w-4 mr-1" />
                      上班
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's Records */}
      <Card>
        <CardHeader>
          <CardTitle>今日打卡記錄</CardTitle>
        </CardHeader>
        <CardContent>
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
              {todayAttendance.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">
                    {employees.find(e => e.id === record.employee_id)?.name || '未知'}
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
        </CardContent>
      </Card>
    </div>
  )
}
