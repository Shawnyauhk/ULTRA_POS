import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, CheckCircle2, X, FileText, Clock, CalendarDays, Star } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

const roleLabels: Record<string, string> = {
  owner: '店主', manager: '主管', staff: '員工',
};

interface TaskItem {
  id: string;
  type: 'approval' | 'request';
  category: string;
  title: string;
  desc: string;
  count: number;
  link: string;
  icon: React.ReactNode;
}

export default function PermissionBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { can } = usePermission();
  const navigate = useNavigate();

  // 待處理任務計數
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  const restaurantId = user?.restaurant_id;
  const canApprove = can('order.approve');
  const canManageAttendance = can('attendance.manage');
  const canManageSchedule = can('schedule.manage');
  const canManageReview = can('review.manage');
  const canCreateOrder = can('order.create');
  const canViewOrder = can('order.view');
  const userId = user?.id;

  const fetchTasks = useCallback(async () => {
    if (!restaurantId || !userId) return;
    setLoading(true);
    const items: TaskItem[] = [];
    try {
      // ===== 1. 待審批的訂貨請求 =====
      if (canApprove) {
        const { count } = await supabase
          .from('order_requests')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending');
        if (count && count > 0) {
          items.push({ id: 'order-approve', type: 'approval', category: '訂貨', title: '待審批訂貨請求', desc: `有 ${count} 筆訂貨請求待你審批`, count, link: '/orders', icon: <FileText className="w-4 h-4" /> });
        }
      }

      // ===== 2. 我的訂貨請求（已審批/已拒絕通知）=====
      if (canCreateOrder || canViewOrder) {
        const { count } = await supabase
          .from('order_requests')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('requested_by', userId)
          .in('status', ['approved', 'rejected']);
        if (count && count > 0) {
          items.push({ id: 'order-my', type: 'request', category: '訂貨', title: '訂貨請求有結果', desc: `有 ${count} 筆訂貨請求已被審批`, count, link: '/orders', icon: <Clock className="w-4 h-4" /> });
        }
      }

      // ===== 3. 待審批的打卡更正 =====
      if (canManageAttendance) {
        const { count } = await supabase
          .from('attendance_corrections')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending');
        if (count && count > 0) {
          items.push({ id: 'attendance-approve', type: 'approval', category: '打卡', title: '待審批補打卡', desc: `有 ${count} 筆補打卡申請待你審批`, count, link: '/attendance', icon: <Clock className="w-4 h-4" /> });
        }
      }

      // ===== 4. 我的打卡更正結果 =====
      if (userId) {
        const { count } = await supabase
          .from('attendance_corrections')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('employee_id', userId)
          .in('status', ['approved', 'rejected']);
        if (count && count > 0) {
          items.push({ id: 'attendance-my', type: 'request', category: '打卡', title: '補打卡有結果', desc: `有 ${count} 筆補打卡申請已被處理`, count, link: '/attendance', icon: <CheckCircle2 className="w-4 h-4" /> });
        }
      }

      // ===== 5. 待審批排班變更 =====
      if (canManageSchedule) {
        const { count } = await supabase
          .from('schedule_changes')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending');
        if (count && count > 0) {
          items.push({ id: 'schedule-approve', type: 'approval', category: '排班', title: '待審批排班變更', desc: `有 ${count} 筆調班/請假申請待你審批`, count, link: '/schedules', icon: <CalendarDays className="w-4 h-4" /> });
        }
      }

      // ===== 6. 我的排班變更結果 =====
      if (userId) {
        const { count } = await supabase
          .from('schedule_changes')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('requested_by', userId)
          .in('status', ['approved', 'rejected']);
        if (count && count > 0) {
          items.push({ id: 'schedule-my', type: 'request', category: '排班', title: '排班變更有結果', desc: `有 ${count} 筆排班申請已被處理`, count, link: '/schedules', icon: <CheckCircle2 className="w-4 h-4" /> });
        }
      }

      // ===== 7. 待審核評價 =====
      if (canManageReview) {
        const { count } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'draft');
        if (count && count > 0) {
          items.push({ id: 'review-approve', type: 'approval', category: '評價', title: '待審核評價', desc: `有 ${count} 條評價草稿待審核`, count, link: '/review-generator', icon: <Star className="w-4 h-4" /> });
        }
      }

    } catch (err) {
      console.warn('[Bell] 查詢待辦事項失敗:', err);
    }
    setTasks(items);
    setLoading(false);
  }, [restaurantId, userId, canApprove, canManageAttendance, canManageSchedule, canManageReview, canCreateOrder, canViewOrder]);

  // 打開時刷新
  useEffect(() => {
    if (open) fetchTasks();
  }, [open, fetchTasks]);

  // 首次載入（未打開時也預先載入紅點判斷）
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 點外部關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const totalPending = tasks.filter(t => t.type === 'approval').reduce((s, t) => s + t.count, 0);
  const hasTasks = tasks.length > 0;

  const handleClick = (link: string) => {
    setOpen(false);
    navigate(link);
  };

  // 分組
  const approvalTasks = tasks.filter(t => t.type === 'approval');
  const requestTasks = tasks.filter(t => t.type === 'request');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="通知與待辦"
      >
        <Bell className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        {hasTasks && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
        )}
        {totalPending > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {totalPending > 99 ? '99+' : totalPending}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-[360px] bg-white border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {/* 頭部 */}
          <div className="p-4 bg-gradient-to-r from-blue-700 to-blue-600 text-white">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-400 text-gray-900 flex items-center justify-center text-lg font-bold shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{user?.name}</div>
                <div className="text-xs text-blue-200">
                  {roleLabels[user?.role || ''] || user?.role}
                  {hasTasks && ` · ${totalPending} 件待處理`}
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-2" />
                載入中...
              </div>
            ) : hasTasks ? (
              <>
                {/* 待我審批 */}
                {approvalTasks.length > 0 && (
                  <div className="p-3 border-b border-gray-100">
                    <div className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> 待你審批
                    </div>
                    <div className="space-y-1">
                      {approvalTasks.map(t => (
                        <button key={t.id} onClick={() => handleClick(t.link)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors text-left group">
                          <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            {t.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{t.title}</div>
                            <div className="text-xs text-gray-500 truncate">{t.desc}</div>
                          </div>
                          <div className="w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {t.count}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 結果通知 */}
                {requestTasks.length > 0 && (
                  <div className="p-3 border-b border-gray-100">
                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 申請結果通知
                    </div>
                    <div className="space-y-1">
                      {requestTasks.map(t => (
                        <button key={t.id} onClick={() => handleClick(t.link)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-left group">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                            {t.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{t.title}</div>
                            <div className="text-xs text-gray-500 truncate">{t.desc}</div>
                          </div>
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {t.count}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-2 text-center text-[10px] text-gray-400 bg-gray-50">
                  點擊項目可跳轉到對應頁面
                </div>
              </>
            ) : (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-gray-600">一切順利</p>
                <p className="text-xs text-gray-400 mt-1">目前沒有需要處理的事項</p>
              </div>
            )}
          </div>

          {/* 底部 */}
          <div className="p-2 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <X className="w-3 h-3" /> 關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
