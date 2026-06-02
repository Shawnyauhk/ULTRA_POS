import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@/types'
import type { PermissionKey, RestaurantRole } from '@/types'
import { clearPermissionCache, refreshCustomPermissions } from '@/hooks/usePermission'
import { Loader2, Save, Shield, CheckCircle } from 'lucide-react'

type RoleName = 'manager' | 'staff'

const ROLES: { key: RoleName; label: string; icon: string }[] = [
  { key: 'manager', label: '主管', icon: '👔' },
  { key: 'staff', label: '員工', icon: '👤' },
]

/** 将权限按功能分组 */
const PERMISSION_GROUPS: { group: string; permissions: PermissionKey[] }[] = [
  { group: '控制面板', permissions: ['dashboard.view'] },
  { group: 'POS 點餐', permissions: ['pos.create_order', 'pos.cancel_order', 'pos.refund'] },
  { group: '產品管理', permissions: ['product.view', 'product.manage'] },
  { group: '庫存管理', permissions: ['inventory.view', 'inventory.manage'] },
  { group: '訂貨管理', permissions: ['order.view', 'order.create', 'order.approve'] },
  { group: '員工管理', permissions: ['employee.view', 'employee.manage'] },
  { group: '打卡系統', permissions: ['attendance.view', 'attendance.manage'] },
  { group: '排班管理', permissions: ['schedule.view', 'schedule.manage'] },
  { group: '薪酬管理', permissions: ['payroll.view', 'payroll.manage'] },
  { group: '財務支出', permissions: ['expense.view', 'expense.manage'] },
  { group: '報表', permissions: ['report.view', 'report.export'] },
  { group: 'AI 功能', permissions: ['ai.marketing', 'ai.customer_service', 'ai.knowledge_base'] },
  { group: '評價管理', permissions: ['review.view', 'review.manage'] },
  { group: '系統設置', permissions: ['setting.view', 'setting.manage'] },
]

export default function PermissionSettingsPage() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      {/* 頁面標題 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">權限設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            自訂主管與員工角色可以使用的功能，只有店主可以修改
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

      {saved && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
          <CheckCircle className="w-5 h-5" />
          權限設定已成功儲存！
        </div>
      )}

      {/* 角色權限卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ROLES.map(({ key, label, icon }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* 角色標題 */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{icon}</span>
                <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => roleSelectAll(key)}
                  className="px-2 py-1 text-primary hover:bg-primary/5 rounded transition-colors"
                >
                  全選
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => roleDeselectAll(key)}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                >
                  全部取消
                </button>
              </div>
            </div>

            {/* 權限群組 */}
            <div className="p-5 space-y-5">
              {PERMISSION_GROUPS.map(({ group, permissions }) => {
                const selectedCount = permissions.filter((p) => rolePermissions[key].includes(p)).length
                const allSelected = selectedCount === permissions.length

                return (
                  <div key={group}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700">{group}</h3>
                      <span className="text-xs text-gray-400">
                        {selectedCount}/{permissions.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {permissions.map((perm) => (
                        <label
                          key={perm}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={rolePermissions[key].includes(perm)}
                            onChange={() => togglePermission(key, perm)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                          />
                          <span className="text-sm text-gray-600 whitespace-nowrap">
                            {ALL_PERMISSIONS[perm]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
