import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Shield, X, Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from '@/types';
import type { PermissionKey, Employee } from '@/types';

const roleLabels: Record<string, string> = {
  owner: '店主',
  manager: '主管',
  staff: '員工',
};

/** 權限分組 */
const PERMISSION_GROUP: Record<string, { label: string; icon: string; keys: PermissionKey[] }> = {
  dashboard:   { label: '控制面板', icon: '📊', keys: ['dashboard.view'] },
  pos:         { label: 'POS 點餐', icon: '🛒', keys: ['pos.create_order', 'pos.cancel_order', 'pos.refund'] },
  product:     { label: '產品管理', icon: '📋', keys: ['product.view', 'product.manage'] },
  inventory:   { label: '庫存管理', icon: '📦', keys: ['inventory.view', 'inventory.manage'] },
  ordering:    { label: '訂貨管理', icon: '🚚', keys: ['order.view', 'order.create', 'order.approve'] },
  employee:    { label: '員工管理', icon: '👥', keys: ['employee.view', 'employee.manage'] },
  attendance:  { label: '打卡管理', icon: '⏰', keys: ['attendance.view', 'attendance.manage'] },
  schedule:    { label: '排班管理', icon: '📅', keys: ['schedule.view', 'schedule.manage'] },
  payroll:     { label: '薪酬管理', icon: '💰', keys: ['payroll.view', 'payroll.manage'] },
  expense:     { label: '支出管理', icon: '🧾', keys: ['expense.view', 'expense.manage'] },
  report:      { label: '報表', icon: '📈', keys: ['report.view', 'report.export'] },
  safe:        { label: '保險箱', icon: '🔒', keys: ['safe.view', 'safe.manage'] },
  ai:          { label: 'AI 功能', icon: '🤖', keys: ['ai.marketing', 'ai.customer_service', 'ai.knowledge_base'] },
  review:      { label: '評價管理', icon: '⭐', keys: ['review.view', 'review.manage'] },
  setting:     { label: '系統設定', icon: '⚙️', keys: ['setting.view', 'setting.manage'] },
};

const MODULE_ORDER = [
  'dashboard', 'pos', 'product', 'inventory', 'ordering',
  'employee', 'attendance', 'schedule', 'payroll',
  'expense', 'report', 'safe', 'ai', 'review', 'setting',
];

export default function PermissionBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { can, permissions } = usePermission();

  // 點外部關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /** 該角色的預設權限列表 */
  const defaultPerms = useMemo(() => {
    if (!user) return [] as PermissionKey[];
    return DEFAULT_ROLE_PERMISSIONS[user.role as Employee['role']] || [];
  }, [user]);

  /** 缺少的預設權限（角色標準有、但用戶實際沒有） */
  const missingPerms = useMemo(() => {
    return defaultPerms.filter(p => !permissions.includes(p));
  }, [defaultPerms, permissions]);

  /** 模組狀態 */
  const moduleStatus = useMemo(() => {
    return MODULE_ORDER.map(key => {
      const group = PERMISSION_GROUP[key];
      const hasAny = group.keys.some(k => permissions.includes(k));
      const shouldHave = group.keys.some(k => defaultPerms.includes(k));
      return { key, ...group, hasAny, shouldHave };
    }).filter(m => m.shouldHave); // 只顯示角色該有的模組
  }, [permissions, defaultPerms]);

  const hasReminders = missingPerms.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="權限提醒"
      >
        <Bell className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        {hasReminders && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {/* 頭部 */}
          <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-400 text-gray-900 flex items-center justify-center text-lg font-bold shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{user?.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <Shield className="w-3 h-3" />
                  {roleLabels[user?.role || ''] || user?.role}
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {/* 權限摘要 */}
            <div className="p-3 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                模組權限概覽
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {moduleStatus.map(m => (
                  <div
                    key={m.key}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs ${
                      m.hasAny
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-50 text-gray-400'
                    }`}
                    title={m.keys.join(', ')}
                  >
                    {m.hasAny
                      ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                      : <Lock className="w-3 h-3 shrink-0" />
                    }
                    <span className="truncate">{m.icon} {m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 缺少的權限警告 */}
            {missingPerms.length > 0 && (
              <div className="p-3 border-b border-gray-100 bg-amber-50/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  缺少 {missingPerms.length} 項權限
                </div>
                <div className="space-y-1">
                  {missingPerms.slice(0, 6).map(p => {
                    const label = ALL_PERMISSIONS[p];
                    return (
                      <div key={p} className="flex items-center gap-2 text-xs text-amber-700 pl-1">
                        <span className="text-amber-400">⚠</span>
                        <span>{label || p}</span>
                      </div>
                    );
                  })}
                  {missingPerms.length > 6 && (
                    <div className="text-xs text-amber-500 pl-4">
                      +{missingPerms.length - 6} 項其餘缺失權限
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-amber-500 mt-1.5 leading-relaxed">
                  可聯絡店主/主管為你開啟對應權限
                </p>
              </div>
            )}

            {/* 全部正常 */}
            {missingPerms.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                你的帳號已具備當前角色應有的所有權限
              </div>
            )}
          </div>

          {/* 底部操作 */}
          <div className="p-2 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <span className="text-[10px] text-gray-400">
              {permissions.length} / {defaultPerms.length} 項權限已啟用
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> 關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
