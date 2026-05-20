import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, FileText, Send, Calendar, Clock, User, CheckCircle2, XCircle, Clock3 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

interface CorrectionRequestProps {
  onRequestSubmitted?: () => void
}

type CorrectionType = 'clock_in' | 'clock_out'

interface CorrectionRecord {
  id: string
  correction_date: string
  correction_type: CorrectionType
  requested_time: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
  reviewer_name?: string
  created_at: string
}

/**
 * 员工补打卡申请组件
 * 包含：提交申请表单 + 历史申请记录
 */
export function CorrectionRequest({ onRequestSubmitted }: CorrectionRequestProps) {
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [correctionDate, setCorrectionDate] = useState(new Date().toISOString().split('T')[0])
  const [correctionType, setCorrectionType] = useState<CorrectionType>('clock_in')
  const [requestedTime, setRequestedTime] = useState('09:00')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 历史申请
  const [records, setRecords] = useState<CorrectionRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  // 加载历史申请
  const fetchRecords = useCallback(async () => {
    if (!user?.id) return
    setLoadingRecords(true)
    try {
      const { data, error } = await supabase
        .from('attendance_corrections')
        .select('*, reviewer:employees!attendance_corrections_reviewed_by_fkey(name)')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setRecords((data || []).map((r: any) => ({
        ...r,
        reviewer_name: r.reviewer?.name || null
      })))
    } catch (err) {
      console.error('获取补打卡记录失败:', err)
    } finally {
      setLoadingRecords(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // 提交申请
  const handleSubmit = useCallback(async () => {
    if (!user?.id || !user?.restaurant_id) return
    setError('')

    // 验证
    if (!correctionDate) {
      setError('请选择日期')
      return
    }
    if (!requestedTime) {
      setError('请选择时间')
      return
    }
    if (!reason.trim()) {
      setError('请填写申请原因')
      return
    }
    // 不能申请未来日期
    const today = new Date().toISOString().split('T')[0]
    if (correctionDate > today) {
      setError('不能申请未来日期的补打卡')
      return
    }

    setSubmitting(true)
    try {
      const { error: insertError } = await supabase
        .from('attendance_corrections')
        .insert([{
          employee_id: user.id,
          restaurant_id: user.restaurant_id,
          correction_date: correctionDate,
          correction_type: correctionType,
          requested_time: requestedTime,
          reason: reason.trim(),
          status: 'pending'
        }])

      if (insertError) throw insertError

      // 重置表单
      setCorrectionDate(today)
      setCorrectionType('clock_in')
      setRequestedTime('09:00')
      setReason('')
      setShowForm(false)
      setError('')

      alert('补打卡申请已提交，请等待管理员审核。')
      fetchRecords()
      onRequestSubmitted?.()
    } catch (err: any) {
      console.error('提交失败:', err)
      setError(err?.message || '提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [user?.id, user?.restaurant_id, correctionDate, correctionType, requestedTime, reason, fetchRecords, onRequestSubmitted])

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-yellow-100 text-yellow-700"><Clock3 className="h-3 w-3" /> 审核中</span>
      case 'approved':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3" /> 已通过</span>
      case 'rejected':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700"><XCircle className="h-3 w-3" /> 已驳回</span>
      default:
        return null
    }
  }

  const typeLabel = (t: CorrectionType) => t === 'clock_in' ? '上班' : '下班'

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">请先登录</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* 提交表单 */}
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              提交补打卡申请
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">补打卡日期</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={correctionDate}
                  onChange={(e) => setCorrectionDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
                />
              </div>
            </div>

            {/* 类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">打卡类型</label>
              <div className="flex gap-2">
                <Button
                  variant={correctionType === 'clock_in' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCorrectionType('clock_in')}
                >
                  上班打卡
                </Button>
                <Button
                  variant={correctionType === 'clock_out' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCorrectionType('clock_out')}
                >
                  下班打卡
                </Button>
              </div>
            </div>

            {/* 时间 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">打卡时间</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="time"
                  value={requestedTime}
                  onChange={(e) => setRequestedTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
                />
              </div>
            </div>

            {/* 原因 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                申请原因
                <span className="text-red-500 ml-1">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请说明为何需要补打卡（如：手机没电、忘记打卡等）"
                rows={3}
                maxLength={200}
                className="w-full px-3 py-2 border rounded-md text-sm resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{reason.length}/200</p>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                提交申请
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              补打卡申请
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              忘记打卡或手机故障？提交补打卡申请，管理员审核后补录。
            </p>
            <Button onClick={() => setShowForm(true)} className="w-full">
              <FileText className="h-4 w-4 mr-2" />
              提交补打卡申请
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 历史记录 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">我的补打卡申请记录</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRecords ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : records.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">暂无申请记录</p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-sm">{record.correction_date}</span>
                      <span className="text-xs text-gray-500">
                        {record.correction_type === 'clock_in' ? '上班' : '下班'}
                      </span>
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{record.requested_time}</span>
                    </div>
                    {statusBadge(record.status)}
                  </div>
                  <p className="text-sm text-gray-600">{record.reason}</p>
                  {record.status !== 'pending' && (
                    <div className="text-xs text-gray-400 space-y-0.5">
                      {record.reviewer_name && <p>审核人: {record.reviewer_name}</p>}
                      {record.review_notes && <p>备注: {record.review_notes}</p>}
                      {record.reviewed_at && (
                        <p>审核时间: {new Date(record.reviewed_at).toLocaleString('zh-HK')}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
