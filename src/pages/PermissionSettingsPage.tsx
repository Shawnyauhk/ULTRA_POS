import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@/types'
import type { PermissionKey, RestaurantRole } from '@/types'
import { clearPermissionCache, refreshCustomPermissions } from '@/hooks/usePermission'
import {
  Loader2, Save, CheckCircle, ChevronDown,
  LayoutDashboard, ShoppingBag, Receipt,
  UserCog, Calculator, DollarSign,
  MessageSquare, Star, Settings
} from 'lucide-react'

type RoleName = 'manager' | 'staff'

const ROLES: { key: RoleName; label: string; icon: string }[] = [
  { key: 'manager', label: '主管', icon: '👔' },
  { key: 'staff', label: '員工', icon: '👤' },
]

/** 侧栏图标映射 */
const MENU_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '控制面板與AI分析': LayoutDashboard,
  'POS 點餐系統': ShoppingBag,
  '訂貨管理': Receipt,
  '人力資源中心': UserCog,
  '門店支出': Calculator,
  '營業額結算': DollarSign,
  'AI 客服管理': MessageSquare,
  'Google 好評': Star,
  '系統設置': Settings,
}

/** 侧栏菜单式权限分组（子权限按逻辑归入对应菜单项） */
const SIDEBAR_GROUPS: { group: string; permissions: PermissionKey[] }[] = [
  { group: '控制面板與AI分析', permissions: ['dashboard.view', 'report.view', 'report.export'] },
  { group: 'POS 點餐系統', permissions: ['pos.create_order', 'pos.cancel_order', 'pos.refund', 'product.view', 'product.manage'] },
  { group: '訂貨管理', permissions: ['order.view', 'order.create', 'order.approve', 'inventory.view', 'inventory.manage'] },
  { group: '人力資源中心', permissions: ['employee.view', 'employee.manage', 'attendance.view', 'attendance.manage', 'schedule.view', 'schedule.manage', 'schedule.smart', 'payroll.view', 'payroll.manage'] },
  { group: '門店支出', permissions: ['expense.view', 'expense.manage', 'expense.monthly_settlement', 'expense.cash_settlement', 'expense.cash_report', 'safe.view', 'safe.manage'] },
  { group: '營業額結算', permissions: ['settlement.view', 'settlement.manage'] },
  { group: 'AI 客服管理', permissions: ['ai.marketing', 'ai.customer_service', 'ai.session_logs', 'ai.knowledge_base'] },
  { group: 'Google 好評', permissions: ['review.view', 'review.manage'] },
  { group: '系統設置', permissions: ['setting.view', 'setting.manage'] },
]

interface Props {
  embedded?: boolean
}

export default function PermissionSettingsPage({ embedded }: Props) {
  const { user } = useAuthStore()
  const [rolePermissions, setRolePermissions] = useState<Record<RoleName, PermissionKey[]>>({
    manager: [],
    staff: [],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadPermissions()
  }, [user?.restaurant_id])

  async function loadPermissions() {
    if (!user?.restaurant_id) return
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('restaurant_roles')
        .select('role_name, permissions')
        .eq('restaurant_id', user.restaurant_id)
        .in('role_name', ['manager', 'staff'])

      if (error) throw error

      const result: Record<RoleName, PermissionKey[]> = { manager: [], staff: [] }

      if (data && data.length > 0) {
        ;(data as Pick<RestaurantRole, 'role_name' | 'permissions'>[]).forEach((row) => {
          if (row.role_name === 'manager' || row.role_name === 'staff') {
            result[row.role_name] = row.permissions ?? []
          }
        })
      } else {
        // 无数据时使用默认值
        result.manager = DEFAULT_ROLE_PERMISSIONS.manager as PermissionKey[]
        result.staff = DEFAULT_ROLE_PERMISSIONS.staff as PermissionKey[]
      }

      setRolePermissions(result)
    } catch (err) {
      console.error('載入權限失敗:', err)
      // 加载失败时使用默认值
      setRolePermissions({
        manager: DEFAULT_ROLE_PERMISSIONS.manager as PermissionKey[],
        staff: DEFAULT_ROLE_PERMISSIONS.staff as PermissionKey[],
      })
    } finally {
      setLoading(false)
    }
  }

  function togglePermission(role: RoleName, permission: PermissionKey) {
    setSaved(false)
    setRolePermissions((prev) => {
      const current = prev[role]
      const updated = current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
      return { ...prev, [role]: updated }
    })
  }

  function roleSelectAll(role: RoleName) {
    setSaved(false)
    const allKeys = Object.keys(ALL_PERMISSIONS) as PermissionKey[]
    setRolePermissions((prev) => ({ ...prev, [role]: allKeys }))
  }

  function roleDeselectAll(role: RoleName) {
    setSaved(false)
    setRolePermissions((prev) => ({ ...prev, [role]: [] }))
  }

  async function handleSave() {
    if (!user?.restaurant_id) return
    setSaving(true)
    setSaved(false)

    try {
      for (const { key } of ROLES) {
        const permissions = rolePermissions[key]
        const rid = user.restaurant_id

        // 先尝试更新（UPDATE）
        const { data: existing } = await supabase
          .from('restaurant_roles')
          .select('id')
          .eq('restaurant_id', rid)
          .eq('role_name', key)
          .maybeSingle()

        if (existing) {
          const { error } = await supabase
            .from('restaurant_roles')
            .update({ permissions, updated_at: new Date().toISOString() })
            .eq('id', existing.id)

          if (error) throw error
        } else {
          const { error } = await supabase
            .from('restaurant_roles')
            .insert({ restaurant_id: rid, role_name: key, permissions })

          if (error) throw error
        }
      }

      // 重新加載快取，使新權限立即生效
      clearPermissionCache()
      await refreshCustomPermissions()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object'
          ? String((err as Record<string, unknown>).message ?? err)
          : String(err)
      console.error('儲存權限失敗:', err)
      alert(`儲存失敗: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const [activeRole, setActiveRole] = useState<RoleName>('manager')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  function toggleGroup(group: string) {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  /** 为当前角色渲染权限列表 */
  function renderRoleContent(role: RoleName) {
    const perms = rolePermissions[role]
    const totalPerms = Object.keys(ALL_PERMISSIONS).length
    const selectedTotal = perms.length

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 角色摘要列 */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>已選 <strong className="text-gray-900">{selectedTotal}</strong> / {totalPerms} 項權限</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => roleSelectAll(role)}
              className="px-2.5 py-1 text-primary hover:bg-primary/5 rounded transition-colors font-medium"
            >
              全選
            </button>
            <button
              onClick={() => roleDeselectAll(role)}
              className="px-2.5 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
            >
              全部取消
            </button>
          </div>
        </div>

        {/* 側欄式可收合權限分組 */}
        <div className="divide-y divide-gray-100">
          {SIDEBAR_GROUPS.map(({ group, permissions }) => {
            const selectedCount = permissions.filter(p => perms.includes(p)).length
            const allSelected = selectedCount === permissions.length
            const isExpanded = expandedGroups[group] === true
            const Icon = MENU_ICONS[group]

            return (
              <div key={group}>
                {/* 分组标题（可点击展开/收起） */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span className="text-sm font-medium text-gray-800 flex-1">{group}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      allSelected
                        ? 'bg-green-50 text-green-600'
                        : selectedCount > 0
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-gray-100 text-gray-400'
                    }`}>
                      {selectedCount}/{permissions.length}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-0' : '-rotate-90'
                    }`} />
                  </div>
                </button>

                {/* 子权限列表 */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 pl-11 space-y-1">
                    {permissions.map(perm => (
                      <label
                        key={perm}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={perms.includes(perm)}
                          onChange={() => togglePermission(role, perm)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                        />
                        <span className="text-sm text-gray-600">{ALL_PERMISSIONS[perm]}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  /** 内层共享的 tab + 保存按钮 + 角色内容 */
  const mainContent = (
    <>
      {saved && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
          <CheckCircle className="w-5 h-5" />
          權限設定已成功儲存！
        </div>
      )}

      {/* 角色 Tab 切换 */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {ROLES.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveRole(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeRole === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* 单个角色的权限面板 */}
      {renderRoleContent(activeRole)}
    </>
  )

  // 嵌入模式
  if (embedded) {
    return (
      <>
        <div className="flex justify-end mb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
        {mainContent}
      </>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-6">
      {/* 頁面標題 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">權限設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            選擇角色，按側欄選單展開設定各項功能的存取權限
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? '儲存中...' : '儲存設定'}
        </button>
      </div>

      {mainContent}
    </div>
  )
}
