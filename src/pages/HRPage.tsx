import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CalendarDays, Clock, Users, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, AlertCircle, Plus, Pencil, Trash2, FileCheck, Smartphone, Brain, Copy, Check } from 'lucide-react'
import { useEmployees, useSchedules, useAttendance, useUnavailability, useSchedulingRules } from '@/hooks/useSupabaseData'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { zhHK } from 'date-fns/locale'
import type { Employee, Schedule, Attendance as AttendanceType, UnavailabilityRecord, SchedulingRuleRecord } from '@/types'
import { generateSchedule, formatScheduleToText, parseScheduleFromText } from '@/lib/schedulingEngine'
import type { ShiftAssignment } from '@/lib/schedulingEngine'

const TABS = [
  { key: 'schedules', label: '排班表', icon: CalendarDays },
  { key: 'attendance', label: '打卡記錄', icon: Clock },
  { key: 'employees', label: '員工名冊', icon: Users },
  { key: 'smart_schedule', label: '智能排班', icon: Brain },
] as const

type TabKey = (typeof TABS)[number]['key']

// AM/PM preset times
const SHIFTS = {
  morning: { label: '早更', start: '09:00', end: '14:00', bg: 'bg-sky-400' },
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

  // === Smart Scheduling (智能排班) ===
  const { records: unavailability, loading: unavailLoading, refetch: refetchUnavail, toggleUnavailability } = useUnavailability(undefined, format(new Date(), 'yyyy-MM'))
  const { rules: schedRules, loading: rulesLoading, refetch: refetchRules, addRule, updateRule, deleteRule } = useSchedulingRules()
  const [schedMonth, setSchedMonth] = useState(new Date())
  const [morningCount, setMorningCount] = useState(2)
  const [eveningCount, setEveningCount] = useState(2)
  const [generatedResult, setGeneratedResult] = useState<ShiftAssignment[]>([])
  const [resultText, setResultText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [newRuleType, setNewRuleType] = useState<'no_same_shift' | 'priority' | 'balanced' | 'fixed_shift'>('no_same_shift')
  const [newRuleEmpA, setNewRuleEmpA] = useState('')
  const [newRuleEmpB, setNewRuleEmpB] = useState('')
  const [showUnavailMark, setShowUnavailMark] = useState(false)
  // Unavailable marking for schedules tab
  const [unavailDate, setUnavailDate] = useState<string>('')

  // === Pending approvals ===
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [showPending, setShowPending] = useState(false)

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
    if (can('attendance.manage') || can('schedule.manage')) fetchPending()
  }, [activeTab, fetchPending])

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
    // Use shift_type from database if available
    if (schedule.shift_type === 'morning' || schedule.shift_type === 'evening') {
      return schedule.shift_type
    }
    // Fallback: guess by start_time
    const st = schedule.start_time
    if (st >= '12:00') return 'evening'
    return 'morning'
  }

  const handleDateClick = (date: Date) => {
    if (!can('schedule.manage')) return
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
      // 1) 获取当前日期的所有排班
      const { data: existing } = await supabase
        .from('schedules')
        .select('id, employee_id')
        .eq('date', selectedDate)

      // 2) 用户选择的排班
      const entries = Object.entries(shiftSelection)
      const selectedEmpIds = new Set(entries.map(([empId]) => empId))

      // 3) 删除"不再选中"的排班，保留"仍然选中"的排班（后续更新或跳过）
      const existingMap = new Map((existing || []).map(e => [e.employee_id, e.id]))
      const toDeleteIds = (existing || [])
        .filter(e => !selectedEmpIds.has(e.employee_id))
        .map(e => e.id)

      if (toDeleteIds.length > 0) {
        const { error: delErr } = await supabase.from('schedules').delete().in('id', toDeleteIds)
        if (delErr) throw delErr
      }

      // 4) 对每个选中员工：已存在则 UPDATE，不存在则 INSERT
      for (const [empId, shift] of entries) {
        const shiftDef = SHIFTS[shift]
        const recordData = {
          employee_id: empId,
          date: selectedDate,
          start_time: shiftDef.start,
          end_time: shiftDef.end,
          shift_type: shift,
          status: 'confirmed' as const,
          created_by: user?.id,
        }

        const existingId = existingMap.get(empId)
        if (existingId) {
          // 已存在 → 更新
          const { error: updErr } = await supabase
            .from('schedules')
            .update(recordData)
            .eq('id', existingId)
          if (updErr) throw updErr
        } else {
          // 不存在 → 新增
          const { error: insErr } = await supabase
            .from('schedules')
            .insert([recordData])
          if (insErr) throw insErr
        }
      }

      await refetchSched()
      setShowSchedModal(false)
    } catch (err) {
      console.error('Error saving schedules:', err)
      const msg = (err as any)?.message || (err as any)?.error_description || JSON.stringify(err)
      setMessage({ type: 'error', text: `儲存失敗 (資料未遺失): ${msg}` })
      // 错误消息持久显示，不自动消失
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
          <p className="text-sm text-gray-500">排班管理 · 打卡記錄 · 員工名冊 · 智能排班</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Pending approvals */}
          {(can('attendance.manage') || can('schedule.manage')) && (
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
          {can('employee.manage') && activeTab === 'employees' && (
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
                        className={`min-h-[80px] rounded-lg border p-1.5 ${today ? 'bg-blue-50 border-blue-200' : 'border-gray-100'} ${can('schedule.manage') ? 'cursor-pointer hover:bg-gray-50 hover:ring-1 hover:ring-gray-300' : ''}`}
                        onClick={() => handleDateClick(day)}
                        onContextMenu={(e) => { if (can('schedule.manage')) { e.preventDefault(); handleDateClick(day) } }}
                      >
                        <div className={`text-xs font-semibold mb-1 ${today ? 'text-blue-700' : 'text-gray-700'}`}>
                          {format(day, 'd')}
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          {dayScheds.slice(0, 5).map(sc => {
                            const emp = activeEmps.find(e => e.id === sc.employee_id)
                            const shift = getScheduleShift(sc)
                            const shiftStyle = SHIFTS[shift]
                            return (
                              <span key={sc.id} className={`inline-block text-[10px] text-white font-medium rounded px-1 py-[1px] leading-tight ${shiftStyle.bg}`}>
                                {emp?.name?.slice(0, 1) || '?'}
                              </span>
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
                      {can('employee.manage') && <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">操作</th>}
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
                        {can('employee.manage') && (
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
                        <td colSpan={can('employee.manage') ? 6 : 5} className="text-center py-12 text-sm text-gray-400">暫無員工資料</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== TAB: SMART SCHEDULING ===== */}
      {activeTab === 'smart_schedule' && (
        <div className="space-y-4">
          {/* Employee Unavailability Section (visible to all) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-400" />
                無法上班標記
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" onClick={() => setSchedMonth(subMonths(schedMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setSchedMonth(addMonths(schedMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">點擊日期標記為無法上班（紅色 = 已標記）</p>
              {unavailLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                      <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const mStart = startOfMonth(schedMonth)
                      const mEnd = endOfMonth(schedMonth)
                      const days = eachDayOfInterval({ start: mStart, end: mEnd })
                      const blanks = Array.from({ length: mStart.getDay() })
                      return (
                        <>
                          {blanks.map((_, i) => (<div key={`b-${i}`} className="min-h-[40px]" />))}
                          {days.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd')
                            const isMarked = unavailability.some(r => r.date === dateStr && r.employee_id === user?.id)
                            const today = isToday(day)
                            return (
                              <button
                                key={dateStr}
                                onClick={() => toggleUnavailability(dateStr)}
                                className={`min-h-[40px] rounded text-xs font-medium transition-colors ${
                                  isMarked
                                    ? 'bg-red-200 text-red-700 hover:bg-red-300'
                                    : today
                                      ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'
                                }`}
                              >
                                {format(day, 'd')}
                              </button>
                            )
                          })}
                        </>
                      )
                    })()}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Admin: Scheduling Rules + Smart Generator */}
          {can('schedule.manage') && (
            <>
              {/* Scheduling Rules Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">排班規則設定</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowRulesEditor(!showRulesEditor)}>
                    {showRulesEditor ? '關閉編輯' : '新增規則'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {showRulesEditor && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-3">
                      <p className="text-xs font-medium text-gray-600">新增排班規則</p>
                      <div>
                        <label className="text-xs text-gray-500">規則類型</label>
                        <select
                          className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1"
                          value={newRuleType}
                          onChange={e => setNewRuleType(e.target.value as any)}
                        >
                          <option value="no_same_shift">不可同班（A與B不能同班）</option>
                          <option value="priority">優先分配（指定員工優先排班）</option>
                          <option value="balanced">平均分配（公平分配班次）</option>
                          <option value="fixed_shift">固定班次（指定員工固定早/晚更）</option>
                        </select>
                      </div>
                      {newRuleType === 'no_same_shift' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">員工 A</label>
                            <select className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1" value={newRuleEmpA} onChange={e => setNewRuleEmpA(e.target.value)}>
                              <option value="">選擇員工</option>
                              {activeEmps.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">員工 B</label>
                            <select className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1" value={newRuleEmpB} onChange={e => setNewRuleEmpB(e.target.value)}>
                              <option value="">選擇員工</option>
                              {activeEmps.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                            </select>
                          </div>
                        </div>
                      )}
                      {newRuleType === 'priority' && (
                        <div>
                          <label className="text-xs text-gray-500">優先安排的員工</label>
                          <select className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1" value={newRuleEmpA} onChange={e => setNewRuleEmpA(e.target.value)}>
                            <option value="">選擇員工</option>
                            {activeEmps.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                          </select>
                        </div>
                      )}
                      {newRuleType === 'fixed_shift' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">員工</label>
                            <select className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1" value={newRuleEmpA} onChange={e => setNewRuleEmpA(e.target.value)}>
                              <option value="">選擇員工</option>
                              {activeEmps.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">固定班次</label>
                            <select
                              className="flex h-9 w-full rounded border border-gray-200 bg-white px-2 text-sm mt-1"
                              value={newRuleEmpB}
                              onChange={e => setNewRuleEmpB(e.target.value)}
                            >
                              <option value="">選擇班次</option>
                              <option value="morning">早更</option>
                              <option value="evening">晚更</option>
                            </select>
                          </div>
                        </div>
                      )}
                      {newRuleType === 'balanced' && (
                        <p className="text-xs text-gray-400">平均分配規則已啟用，系統會自動平衡每位員工的排班次數。</p>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setShowRulesEditor(false)}>取消</Button>
                        <Button size="sm" onClick={async () => {
                          let config: Record<string, any> = {}
                          let label = ''
                          if (newRuleType === 'no_same_shift' && newRuleEmpA && newRuleEmpB) {
                            config = { employee_ids: [newRuleEmpA, newRuleEmpB] }
                            const a = activeEmps.find(e => e.id === newRuleEmpA)?.name || ''
                            const b = activeEmps.find(e => e.id === newRuleEmpB)?.name || ''
                            label = `${a} 與 ${b} 不可同班`
                          } else if (newRuleType === 'priority' && newRuleEmpA) {
                            config = { employee_ids: [newRuleEmpA] }
                            const a = activeEmps.find(e => e.id === newRuleEmpA)?.name || ''
                            label = `${a} 優先排班`
                          } else if (newRuleType === 'balanced') {
                            config = { target_shifts_per_week: 5 }
                            label = '平均分配班次'
                          } else if (newRuleType === 'fixed_shift' && newRuleEmpA && newRuleEmpB) {
                            config = { employee_id: newRuleEmpA, shift: newRuleEmpB }
                            const a = activeEmps.find(e => e.id === newRuleEmpA)?.name || ''
                            label = `${a} 固定${newRuleEmpB === 'morning' ? '早更' : '晚更'}`
                          }
                          if (config && Object.keys(config).length > 0) {
                            await addRule({
                              rule_type: newRuleType,
                              rule_config: config,
                              label,
                              is_active: true,
                              sort_order: schedRules.length,
                            })
                            setNewRuleEmpA('')
                            setNewRuleEmpB('')
                          }
                          setShowRulesEditor(false)
                        }}>新增</Button>
                      </div>
                    </div>
                  )}

                  {rulesLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : schedRules.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400">尚未設定排班規則，點擊「新增規則」開始</div>
                  ) : (
                    <div className="space-y-1.5">
                      {schedRules.map(rule => (
                        <div key={rule.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => updateRule(rule.id, { is_active: !rule.is_active })}
                              className={`w-3 h-3 rounded-full shrink-0 ${rule.is_active ? 'bg-green-400' : 'bg-gray-300'}`}
                            />
                            <span className="text-sm text-gray-700 truncate">{rule.label || rule.rule_type}</span>
                            <Badge variant="outline" className="text-[10px]">{rule.rule_type === 'no_same_shift' ? '不同班' : rule.rule_type === 'priority' ? '優先' : rule.rule_type === 'balanced' ? '平均' : '固定'}</Badge>
                          </div>
                          <button onClick={() => deleteRule(rule.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Smart Schedule Generator */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">智能排班生成</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-xs text-gray-500">排班月份</label>
                      <Input
                        type="month"
                        value={format(schedMonth, 'yyyy-MM')}
                        onChange={e => { const d = new Date(e.target.value + '-01'); setSchedMonth(d) }}
                        className="w-40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">每班早更人數</label>
                      <Input type="number" min={1} max={10} value={morningCount} onChange={e => setMorningCount(parseInt(e.target.value) || 2)} className="w-20" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">每班晚更人數</label>
                      <Input type="number" min={1} max={10} value={eveningCount} onChange={e => setEveningCount(parseInt(e.target.value) || 2)} className="w-20" />
                    </div>
                    <Button
                      onClick={async () => {
                        setGenerating(true)
                        try {
                          const year = schedMonth.getFullYear()
                          const month = schedMonth.getMonth() + 1
                          const schedEmployees = activeEmps.map(e => ({ id: e.id, name: e.name, role: e.role }))
                          const unavailRecords: { employee_id: string; date: string; reason?: string }[] = unavailability.map(u => ({
                            employee_id: u.employee_id,
                            date: u.date,
                            reason: u.reason,
                          }))
                          const activeRules = schedRules.filter(r => r.is_active).map(r => ({
                            rule_type: r.rule_type,
                            rule_config: r.rule_config,
                            label: r.label,
                            is_active: r.is_active,
                            sort_order: r.sort_order,
                          }))

                          const result = generateSchedule({
                            year,
                            month,
                            employees: schedEmployees,
                            unavailability: unavailRecords,
                            rules: activeRules,
                            morningCount,
                            eveningCount,
                          })

                          setGeneratedResult(result)

                          const empNameMap: Record<string, string> = {}
                          for (const e of activeEmps) { empNameMap[e.id] = e.name }

                          const text = formatScheduleToText(result, empNameMap, year, month)
                          setResultText(text)
                        } catch (err) {
                          console.error('Generate schedule error:', err)
                        } finally {
                          setGenerating(false)
                        }
                      }}
                      disabled={generating}
                    >
                      {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 生成中...</> : '生成排班'}
                    </Button>
                  </div>

                  {resultText && (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">排班結果</p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(resultText)
                              setCopySuccess(true)
                              setTimeout(() => setCopySuccess(false), 2000)
                            }}
                          >
                            {copySuccess ? <><Check className="h-3.5 w-3.5 mr-1 text-green-500" /> 已複製</> : <><Copy className="h-3.5 w-3.5 mr-1" /> 複製文字</>}
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!generatedResult.length) return
                              setSaving(true)
                              try {
                                const nameToId: Record<string, string> = {}
                                for (const e of activeEmps) { nameToId[e.name] = e.id }

                                let assignments = parseScheduleFromText(resultText)
                                if (assignments.length === 0) {
                                  assignments = generatedResult
                                }

                                const resolved = assignments.map(a => ({
                                  date: a.date,
                                  morning: a.morning.map(n => nameToId[n] || n),
                                  evening: a.evening.map(n => nameToId[n] || n),
                                }))

                                const monthStr = format(schedMonth, 'yyyy-MM')
                                const { data: existing } = await supabase
                                  .from('schedules')
                                  .select('id')
                                  .gte('date', `${monthStr}-01`)
                                  .lte('date', `${monthStr}-31`)
                                if (existing && existing.length > 0) {
                                  await supabase.from('schedules').delete().in('id', existing.map(e => e.id))
                                }

                                const records: any[] = []
                                for (const a of resolved) {
                                  for (const empId of a.morning) {
                                    if (empId.length < 30) continue
                                    records.push({
                                      employee_id: empId,
                                      date: a.date,
                                      start_time: '09:00',
                                      end_time: '14:00',
                                      shift_type: 'morning',
                                      status: 'confirmed',
                                      created_by: user?.id,
                                      notes: '智能排班生成',
                                    })
                                  }
                                  for (const empId of a.evening) {
                                    if (empId.length < 30) continue
                                    records.push({
                                      employee_id: empId,
                                      date: a.date,
                                      start_time: '14:00',
                                      end_time: '19:00',
                                      shift_type: 'evening',
                                      status: 'confirmed',
                                      created_by: user?.id,
                                      notes: '智能排班生成',
                                    })
                                  }
                                }

                                if (records.length > 0) {
                                  const { error } = await supabase.from('schedules').insert(records)
                                  if (error) throw error
                                }

                                await refetchSched()
                                refetchUnavail()
                              } catch (err) {
                                console.error('Error applying smart schedule:', err)
                              } finally {
                                setSaving(false)
                              }
                            }}
                            disabled={saving}
                          >
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            套用到日曆
                          </Button>
                        </div>
                      </div>
                      <textarea
                        className="w-full h-64 font-mono text-xs leading-relaxed p-3 border border-gray-200 rounded-lg bg-gray-50 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={resultText}
                        onChange={e => setResultText(e.target.value)}
                      />
                      <p className="text-[10px] text-gray-400">可直接編輯上方文字，修改後點擊「套用到日曆」更新排班</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
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
