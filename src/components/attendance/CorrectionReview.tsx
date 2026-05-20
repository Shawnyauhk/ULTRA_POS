import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, User, Calendar, Clock, FileText, Inbox } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

interface CorrectionRecord {
  id: string
  employee_id: string
  restaurant_id: string
  correction_date: string
  correction_type: 'clock_in' | 'clock_out'
  requested_time: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  employee_name?: string
  employee_role?: string
  created_at: string
}

/**
 * 管理员补打卡审核组件
 * 查看所有待审核申请，批准或驳回
 */
export function CorrectionReview() {
  const { user } = useAuthStore()
  const [records, setRecords] = useState<CorrectionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null)

  // 是否可见（仅 owner/manager）
  const canReview = user?.role === 'owner' || user?.role === 'manager'

  const fetchRecords = useCallback(async () => {
    if (!user?.restaurant_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attendance_corrections')
        .select('*, employee:employees(name, role)')
        .eq('restaurant_id', user.restaurant_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRecords((data || []).map((r: any) => ({
        ...r,
        employee_name: r.employee?.name || '未知',
        employee_role: r.employee?.role || 'staff'
      })))
    } catch (err) {
      console.error('获取待审核记录失败:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.restaurant_id])

  useEffect(() => {
    if (canReview) fetchRecords()
  }, [canReview, fetchRecords])

  // 批准
  const handleApprove = useCallback(async (record: CorrectionRecord) => {
    if (!user?.id) return
    setProcessingId(record.id)

    try {
      // 1. 检查该日期是否已有打卡记录
      const { data: existing } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', record.employee_id)
        .eq('date', record.correction_date)
        .single()

      let attendanceId: string | null = null

      if (record.correction_type === 'clock_in') {
        if (existing) {
          // 已有记录，更新 clock_in
          const { error } = await supabase
            .from('attendance')
            .update({ clock_in: record.requested_time, verification_method: 'manual' })
            .eq('id', existing.id)
          if (error) throw error
          attendanceId = existing.id
        } else {
          // 新建记录
          const { data: newRecord, error } = await supabase
            .from('attendance')
            .insert([{
              employee_id: record.employee_id,
              date: record.correction_date,
              clock_in: record.requested_time,
              verification_method: 'manual'
            }])
            .select()
            .single()
          if (error) throw error
          attendanceId = newRecord.id
        }
      } else {
        // clock_out
        if (!existing) {
          alert('该日期没有上班记录，无法补下班打卡。请先补上班打卡。')
          setProcessingId(null)
          return
        }
        const [inH, inM] = (existing.clock_in || '00:00').split(':').map(Number)
        const [outH, outM] = record.requested_time.split(':').map(Number)
        const workHours = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 100) / 100)

        const { error } = await supabase
          .from('attendance')
          .update({ clock_out: record.requested_time, work_hours: workHours })
          .eq('id', existing.id)
        if (error) throw error
        attendanceId = existing.id
      }

      // 2. 更新审批状态
      const { error: updateError } = await supabase
        .from('attendance_corrections')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          attendance_id: attendanceId
        })
        .eq('id', record.id)

      if (updateError) throw updateError

      // 3. 记录审计日志
      await supabase
        .from('attendance_audit_logs')
        .insert([{
          attendance_id: attendanceId,
          employee_id: record.employee_id,
          action: record.correction_type === 'clock_in' ? 'clock_in' : 'clock_out',
          action_by: user.id,
          device_info: { note: '补打卡审批通过' },
          verification_result: { method: 'manual', passed: true, correction_id: record.id }
        }])

      // 刷新
      await fetchRecords()
    } catch (err: any) {
      console.error('批准失败:', err)
      alert('操作失败: ' + (err?.message || '未知错误'))
    } finally {
      setProcessingId(null)
    }
  }, [user?.id, fetchRecords])

  // 驳回
  const handleReject = useCallback(async (recordId: string) => {
    if (!user?.id || !rejectNotes.trim()) {
      alert('请填写驳回原因')
      return
    }
    setProcessingId(recordId)

    try {
      const { error } = await supabase
        .from('attendance_corrections')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: rejectNotes.trim()
        })
        .eq('id', recordId)

      if (error) throw error

      setShowRejectInput(null)
      setRejectNotes('')
      await fetchRecords()
    } catch (err: any) {
      console.error('驳回失败:', err)
      alert('操作失败: ' + (err?.message || '未知错误'))
    } finally {
      setProcessingId(null)
    }
  }, [user?.id, rejectNotes, fetchRecords])

  if (!canReview) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Inbox className="h-5 w-5" />
          补打卡审核
          {records.length > 0 && (
            <span className="text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-normal">
              {records.length} 待审核
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Inbox className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无待审核的补打卡申请</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div key={record.id} className="border rounded-lg p-4 space-y-3">
                {/* 员工信息 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{record.employee_name}</p>
                      <p className="text-xs text-gray-400">
                        {record.employee_role === 'owner' ? '店主' : record.employee_role === 'manager' ? '主管' : '员工'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    record.correction_type === 'clock_in'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-orange-50 text-orange-600'
                  }`}>
                    {record.correction_type === 'clock_in' ? '上班' : '下班'}补卡
                  </span>
                </div>

                {/* 申请详情 */}
                <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>{record.correction_date}</span>
                    <Clock className="h-4 w-4 text-gray-400 ml-2" />
                    <span>{record.requested_time}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                    <span className="text-gray-600">{record.reason || '未提供原因'}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    申请时间: {new Date(record.created_at).toLocaleString('zh-HK')}
                  </p>
                </div>

                {/* 操作按钮 */}
                {showRejectInput === record.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="请填写驳回原因"
                      rows={2}
                      maxLength={100}
                      className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(record.id)}
                        disabled={processingId === record.id}
                      >
                        {processingId === record.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        确认驳回
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowRejectInput(null); setRejectNotes(''); }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApprove(record)}
                      disabled={processingId === record.id}
                    >
                      {processingId === record.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowRejectInput(record.id)}
                      disabled={processingId === record.id}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      驳回
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
