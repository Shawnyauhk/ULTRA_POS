import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths } from 'date-fns'
import { zhHK } from 'date-fns/locale'
import { useEmployees, useSchedules } from '@/hooks/useSupabaseData'
import { usePermission } from '@/hooks/usePermission'
import type { Schedule } from '@/types'

export function SchedulesPage() {
  const { can } = usePermission()
  const { employees, loading: empLoading } = useEmployees()
  const { schedules, loading, refetch, addSchedule, deleteSchedule } = useSchedules()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    employee_id: '',
    start_time: '09:00',
    end_time: '18:00',
  })

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const getSchedulesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return schedules.filter(s => s.date === dateStr)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'))
    setShowModal(true)
  }

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.employee_id) {
      alert('請選擇員工')
      return
    }
    setSaving(true)
    const result = await addSchedule({
      employee_id: formData.employee_id,
      date: selectedDate,
      start_time: formData.start_time,
      end_time: formData.end_time,
    })
    setSaving(false)
    if (result) {
      setShowModal(false)
      setFormData({ employee_id: '', start_time: '09:00', end_time: '18:00' })
    } else {
      alert('新增排班失敗')
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    if (confirm('確定刪除此排班？')) {
      await deleteSchedule(id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">排班管理</h1>
          <p className="text-gray-500 mt-1">管理員工每月排班</p>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{format(currentMonth, 'yyyy 年 MM 月', { locale: zhHK })}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['日', '一', '二', '三', '四', '五', '六'].map((day, i) => (
                  <div key={i} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border rounded-lg p-2 bg-gray-50" />
                ))}
                {monthDays.map((day) => {
                  const daySchedules = getSchedulesForDate(day)
                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[100px] border rounded-lg p-2 ${can('schedule.manage') ? 'cursor-pointer hover:bg-gray-50' : ''} ${isToday(day) ? 'bg-blue-50 border-blue-200' : ''}`}
                      onClick={() => can('schedule.manage') && handleDateClick(day)}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-blue-600' : ''}`}>
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {daySchedules.slice(0, 3).map((schedule) => {
                          const emp = employees.find(e => e.id === schedule.employee_id)
                          return (
                            <div key={schedule.id} className="text-xs bg-primary/10 text-primary rounded px-1 py-0.5 truncate flex items-center justify-between">
                              <span>{emp?.name}</span>
                              {can('schedule.manage') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id) }}
                                  className="hover:text-red-500"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {daySchedules.length > 3 && (
                          <div className="text-xs text-gray-500">+{daySchedules.length - 3} 更多</div>
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

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            {employees.filter(e => e.is_active).map((emp) => (
              <div key={emp.id} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-sm">{emp.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>新增班次 - {selectedDate}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddSchedule} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">員工</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    required
                  >
                    <option value="">選擇員工</option>
                    {employees.filter(e => e.is_active).map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">上班時間</label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">下班時間</label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    新增
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
