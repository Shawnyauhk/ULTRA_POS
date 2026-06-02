import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CalendarDays, Clock, Users, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, AlertCircle, Plus, Pencil, Trash2, FileCheck, Smartphone } from 'lucide-react'
import { useEmployees, useSchedules, useAttendance } from '@/hooks/useSupabaseData'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths } from 'date-fns'
import { zhHK } from 'date-fns/locale'
import type { Employee, Schedule, Attendance as AttendanceType } from '@/types'

const TABS = [
  { key: 'schedules', label: '排班表', icon: CalendarDays },
  { key: 'attendance', label: '打卡記錄', icon: Clock },
  { key: 'employees', label: '員工名冊', icon: Users },
] as const

type TabKey = (typeof TABS)[number]['key']

// AM/PM preset times
const SHIFTS = {
  morning: { label: '早更', start: '09:00', end: '14:00', bg: 'bg-blue-500' },
  evening: { label: '晚更', start: '14:00', end: '19:00', bg: 'bg-blue-900' },
} as const

type ShiftKey = keyof typeof SHIFTS

export function HRPage() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const { user } = useAuthStore()
  const { employees, loading: empLoading, refetch: refetchEmps, addEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const { schedules, loading: schedLoading, refetch: refetchSched, addSchedule, deleteSchedule } = useSchedules()
  const { attendance, loading: attLoading, refetch: refetchAtt } = useAttendance()

  const [activeTab, setActiveTab] = useState<TabKey>('schedules')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [showSchedModal, setShowSchedModal] = useState(false)
  const [saving, setSaving] = useState(false)
  // AM/PM employee selection map per date: { employeeId: ShiftKey }
  const [shiftSelection, setShiftSelection] = useState<Record<string, ShiftKey>>({})

  // === Pending approvals ===
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [showPending, setShowPending] = useState(false)

  const canManage = user?.role === 'owner' || user?.role === 'manager'

  // === Employee CRUD ===
  const [showEmpModal, setShowEmpModal] = useState(false)
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null)
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<string | null>(null)
  const [empForm, setEmpForm] = useState({
    name: '', phone: '', email: '', role: 'staff' as Employee['role'],
    salary_type: 'hourly' as 'hourly' | 'monthly',
    hourly_rate: 50, monthly_salary: 0,
    hire_date: new Date().toISOString().split('T')[0],
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const activeEmps = useMemo(() => employees.filter(e => e.is_active), [employees])

  // ===== PENDING APPROVALS =====
  const fetchPending = useCallback(async () => {
    try {
      const { data, count } = await supabase
        .from('attendance_corrections')
        .select('*, employee:employees(name)', { count: 'exact' })
        .eq('restaurant_id', user?.restaurant_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (data) {
        setPendingItems(data)
        setPendingCount(count || 0)
      }
    } catch { /* ignore */ }
  }, [user?.restaurant_id])

  useEffect(() => {
    if (canManage) fetchPending()
  }, [canManage, fetchPending])

  const handleApproveCorrection = async (id: string) => {
    await supabase.from('attendance_corrections').update({ status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id)
    fetchPending()
    refetchAtt()
  }

  const handleRejectCorrection = async (id: string) => {
    await supabase.from('attendance_corrections').update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id)
    fetchPending()
  }

  // ===== SCHEDULES =====
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {}
    for (const s of schedules) {
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    }
    return map
  }, [schedules])

  const getScheduleShift = (schedule: Schedule): ShiftKey => {
    const st = schedule.start_time
    if (st >= '12:00') return 'evening'
    return 'morning'
  }

  const handleDateClick = (date: Date) => {
    if (!canManage) return
    const dateStr = format(date, 'yyyy-MM-dd')
    setSelectedDate(dateStr)
    // Build current selections for the date
    const dayScheds = schedules.filter(s => s.date === dateStr)
    const sel: Record<string, ShiftKey> = {}
    for (const s of dayScheds) {
      sel[s.employee_id] = getScheduleShift(s)
    }
    setShiftSelection(sel)
    setShowSchedModal(true)
  }

  const handleSaveSchedules = async () => {
    if (!selectedDate) return
    setSaving(true)
    try {
      // Delete all existing schedules for this date
      const { data: existing } = await supabase
        .from('schedules')
        .select('id')
        .eq('date', selectedDate)
      if (existing && existing.length > 0) {
        await supabase.from('schedules').delete().in('id', existing.map(e => e.id))
      }
      // Create new schedules based on selections
      for (const [empId, shift] of Object.entries(shiftSelection)) {
        const shiftDef = SHIFTS[shift]
        await supabase.from('schedules').insert([{
          restaurant_id: user?.restaurant_id,
          employee_id: empId,
          date: selectedDate,
          start_time: shiftDef.start,
          end_time: shiftDef.end,
          shift_type: shift,
          status: 'confirmed',
          created_by: user?.id,
        }])
      }
      await refetchSched()
      setShowSchedModal(false)
    } catch (err) {
      console.error('Error saving schedules:', err)
    } finally {
      setSaving(false)
    }
  }

  const getSchedulesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return schedulesByDate[dateStr] || []
  }

  // ===== EMPLOYEES =====
  const resetEmpForm = () => {
    setEmpForm({
      name: '', phone: '', email: '', role: 'staff',
      salary_type: 'hourly', hourly_rate: 50, monthly_salary: 0,
      hire_date: new Date().toISOString().split('T')[0],
    })
  }

  const handleOpenAddEmp = () => {
    resetEmpForm()
    setEditingEmp(null)
    setShowEmpModal(true)
  }

  const handleOpenEditEmp = (emp: Employee) => {
    setEmpForm({
      name: emp.name, phone: emp.phone || '', email: emp.email || '', role: emp.role,
      salary_type: (emp as any).salary_type || (emp.hourly_rate ? 'hourly' : 'monthly'),
      hourly_rate: emp.hourly_rate || 0,
      monthly_salary: emp.monthly_salary || 0,
      hire_date: emp.hire_date || new Date().toISOString().split('T')[0],
    })
    setEditingEmp(emp)
    setShowEmpModal(true)
  }

  const handleSaveEmp = async () => {
    setSaving(true)
    const data: any = {
      name: empForm.name,
      phone: empForm.phone || null,
      email: empForm.email || null,
      role: empForm.role,
      salary_type: empForm.salary_type,
      hire_date: empForm.hire_date,
      hourly_rate: empForm.salary_type === 'hourly' ? empForm.hourly_rate : null,
      monthly_salary: empForm.salary_type === 'monthly' ? empForm.monthly_salary : null,
    }
    let ok: boolean
    if (editingEmp) {
      ok = !!await updateEmployee(editingEmp.id, data)
    } else {
      ok = !!await addEmployee(data as any)
    }
    setSaving(false)
    if (ok) {
      setShowEmpModal(false)
      setMessage({ type: 'success', text: editingEmp ? '員工資料已更新' : '員工已新增' })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: '操作失敗' })
    }
  }

  const handleDeleteEmp = async (id: string) => {
    const ok = await deleteEmployee(id)
    if (ok) {
      setConfirmDeleteEmp(null)
      setMessage({ type: 'success', text: '員工已停用' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const roleLabels: Record<string, string> = { owner: '店主', manager: '主管', staff: '員工' }

  // ===== RENDER =====
  return (
    <div className="p-3 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">員工與排班</h1>
          <p className="text-sm text-gray-500">排班管理 · 打卡記錄 · 員工名冊</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Pending approvals */}
          {canManage && (
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowPending(!showPending)}>
                <FileCheck className="h-4 w-4 mr-1.5" />
                審批
                {pendingCount > 0 && <Badge className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0">{pendingCount}</Badge>}
              </Button>
              {showPending && (
                <Card className="absolute right-0 top-full mt-2 w-80 z-50 shadow-xl">
                  <CardContent className="p-3 max-h-72 overflow-y-auto space-y-2">
                    <p className="text-xs font-medium text-gray-500 mb-2">待審批補打卡</p>
                    {pendingItems.length === 0 ? (
                      <p className="text-xs text-gray-400 py-3 text-center">暫無待審批項目</p>
                    ) : (
                      pendingItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{item.employee?.name || '未知'}</p>
                            <p className="text-[10px] text-gray-400">{item.correction_date} {item.correction_type === 'clock_in' ? '上班卡' : '下班卡'}</p>
                            {item.reason && <p className="text-[10px] text-gray-400 truncate">{item.reason}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleApproveCorrection(item.id)} className="p-1 rounded hover:bg-green-100 text-green-600"><CheckCircle2 className="h-4 w-4" /></button>
                            <button onClick={() => handleRejectCorrection(item.id)} className="p-1 rounded hover:bg-red-100 text-red-500"><XCircle className="h-4 w-4" /></button>
                          </div>
                        </div>
                      ))
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowPending(false)}>關閉</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {canManage && activeTab === 'employees' && (
            <Button size="sm" onClick={handleOpenAddEmp}>
              <Plus className="h-4 w-4 mr-1.5" />新增員工
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* ===== TAB: SCHEDULES ===== */}
      {activeTab === 'schedules' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{format(currentMonth, 'yyyy 年 MM 月', { locale: zhHK })}</CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>今天</Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {schedLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                    <div key={i} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                    <div key={`e-${i}`} className="min-h-[80px] rounded-lg bg-gray-50 border border-gray-100" />
                  ))}
                  {monthDays.map((day) => {
                    const dayScheds = getSchedulesForDate(day)
                    const today = isToday(day)
                    return (
                      <div
                        key={day.toISOString()}
                        className={`min-h-[80px] rounded-lg border p-1.5 ${today ? 'bg-blue-50 border-blue-200' : 'border-gray-100'} ${canManage ? 'cursor-pointer hover:bg-gray-50 hover:ring-1 hover:ring-gray-300' : ''}`}
                        onClick={() => handleDateClick(day)}
                        onContextMenu={(e) => { if (canManage) { e.preventDefault(); handleDateClick(day) } }}
                      >
                        <div className={`text-xs font-semibold mb-1 ${today ? 'text-blue-700' : 'text-gray-700'}`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayScheds.slice(0, 5).map(sc => {
                            const emp = activeEmps.find(e => e.id === sc.employee_id)
                            const shift = getScheduleShift(sc)
                            const shiftStyle = SHIFTS[shift]
                            return (
                              <div key={sc.id} className={`text-[10px] text-white font-medium rounded px-1 py-[1px] truncate leading-tight ${shiftStyle.bg}`}>
                                {emp?.name?.slice(0, 2) || '??'}
                              </div>
                            )
                          })}
                          {dayScheds.length > 5 && (
                            <div className="text-[10px] text-gray-400">+{dayScheds.length - 5}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== TAB: ATTENDANCE RECORDS ===== */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/attendance')}>
                <Smartphone className="h-4 w-4 mr-1.5" />打卡系統
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              {attLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : attendance.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">暫無打卡記錄</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">員工</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">日期</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">排班</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">上班</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">下班</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">工時</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.slice(0, 100).map((rec: any) => {
                        const sched = schedules.find(s => s.employee_id === rec.employee_id && s.date === rec.date)
                        const shift = sched ? getScheduleShift(sched) : null
                        const statusText = rec.status === 'ontime' ? '準時' :
                          rec.status === 'late' ? `遲到${rec.late_minutes}分` :
                          rec.status === 'early' ? `早退${rec.early_minutes}分` :
                          rec.status === 'forgot_clock_in' ? '忘打卡上班' :
                          rec.status === 'forgot_clock_out' ? '忘打卡下班' : '-'
                        return (
                          <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{rec.employee?.name || '未知'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{rec.date}</td>
                            <td className="px-4 py-2.5">
                              {shift && <span className={`text-xs px-1.5 py-0.5 rounded text-white font-medium ${SHIFTS[shift].bg}`}>{SHIFTS[shift].label}</span>}
                              {!shift && <span className="text-xs text-gray-400">-</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{rec.clock_in ? rec.clock_in.slice(0, 5) : '-'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{rec.clock_out ? rec.clock_out.slice(0, 5) : '-'}</td>
                            <td className="px-4 py-2.5 font-medium">{rec.work_hours ? `${rec.work_hours}h` : '-'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium ${
                                rec.status === 'ontime' ? 'text-green-600' :
                                rec.status === 'late' ? 'text-orange-600' :
                                rec.status === 'early' ? 'text-yellow-600' :
                                'text-red-500'
                              }`}>{statusText}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== TAB: EMPLOYEES ===== */}
      {activeTab === 'employees' && (
        <Card>
          <CardContent className="p-0">
            {empLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">姓名</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">職位</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">薪資類型</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">薪資</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">狀態</th>
                      {canManage && <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp: Employee) => (
                      <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{emp.name}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={emp.role === 'owner' ? 'default' : emp.role === 'manager' ? 'secondary' : 'outline'} className="text-[10px]">{roleLabels[emp.role]}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {(emp as any).salary_type === 'monthly' ? '月薪' : (emp as any).salary_type === 'daily' ? '日薪' : '時薪'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {emp.hourly_rate ? `$${emp.hourly_rate}/h` : emp.monthly_salary ? `$${emp.monthly_salary.toLocaleString()}/月` : '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium ${emp.is_active ? 'text-green-600' : 'text-red-400'}`}>
                            {emp.is_active ? '在職' : '離職'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleOpenEditEmp(emp)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {emp.is_active && (
                                <button onClick={() => setConfirmDeleteEmp(emp.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {employees.length === 0 && (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="text-center py-12 text-sm text-gray-400">暫無員工資料</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== MODAL: Schedule Edit ===== */}
      {showSchedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSchedModal(false)}>
          <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">編輯排班 — {selectedDate}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded bg-blue-500" />
                  <span>早更 09:00-14:00</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded bg-blue-900" />
                  <span>晚更 14:00-19:00</span>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {activeEmps.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">{emp.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setShiftSelection(prev => ({ ...prev, [emp.id]: 'morning' }))}
                        className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                          shiftSelection[emp.id] === 'morning' ? 'bg-blue-500 text-white ring-2 ring-blue-300' : 'bg-gray-200 text-gray-500 hover:bg-blue-100'
                        }`}
                      >
                        早
                      </button>
                      <button
                        onClick={() => setShiftSelection(prev => ({ ...prev, [emp.id]: 'evening' }))}
                        className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                          shiftSelection[emp.id] === 'evening' ? 'bg-blue-900 text-white ring-2 ring-blue-400' : 'bg-gray-200 text-gray-500 hover:bg-blue-100'
                        }`}
                      >
                        晚
                      </button>
                      {shiftSelection[emp.id] && (
                        <button
                          onClick={() => {
                            const next = { ...shiftSelection }
                            delete next[emp.id]
                            setShiftSelection(next)
                          }}
                          className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-400 hover:bg-red-100 hover:text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="text-xs text-gray-400">已選 {Object.keys(shiftSelection).length} 人</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowSchedModal(false)}>取消</Button>
                  <Button onClick={handleSaveSchedules} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    儲存排班
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== MODAL: Employee Add/Edit ===== */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEmpModal(false)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{editingEmp ? '編輯員工' : '新增員工'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">姓名</label>
                <Input value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} placeholder="員工姓名" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">電話</label>
                  <Input value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} placeholder="電話" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">電郵</label>
                  <Input value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">職位</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value as any }))}>
                  <option value="staff">員工</option>
                  <option value="manager">主管</option>
                  <option value="owner">店主</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">薪資類型</label>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setEmpForm(f => ({ ...f, salary_type: 'hourly' as const }))} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${empForm.salary_type === 'hourly' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`} >時薪</button>
                  <button onClick={() => setEmpForm(f => ({ ...f, salary_type: 'monthly' as const }))} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${empForm.salary_type === 'monthly' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`} >月薪</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">{empForm.salary_type === 'hourly' ? '時薪' : '月薪'}</label>
                <Input type="number" value={empForm.salary_type === 'hourly' ? empForm.hourly_rate : empForm.monthly_salary} onChange={e => {
                  const v = Number(e.target.value)
                  empForm.salary_type === 'hourly' ? setEmpForm(f => ({ ...f, hourly_rate: v })) : setEmpForm(f => ({ ...f, monthly_salary: v }))
                }} min={0} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">入職日期</label>
                <Input type="date" value={empForm.hire_date} onChange={e => setEmpForm(f => ({ ...f, hire_date: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" onClick={() => setShowEmpModal(false)}>取消</Button>
                <Button onClick={handleSaveEmp} disabled={saving || !empForm.name}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingEmp ? '儲存' : '新增'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== CONFIRM: Delete Employee ===== */}
      {confirmDeleteEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDeleteEmp(null)}>
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-500 shrink-0" />
                <p className="text-sm text-gray-700">確定停用此員工？停用後無法打卡，但歷史記錄保留。</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDeleteEmp(null)}>取消</Button>
                <Button variant="destructive" onClick={() => handleDeleteEmp(confirmDeleteEmp)}>確認停用</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
