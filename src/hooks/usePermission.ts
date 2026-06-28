import { useMemo, useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { PermissionKey } from '@/types'
import { DEFAULT_ROLE_PERMISSIONS } from '@/types'

// 模組級快取（不受 React 渲染週期影響）
let cachedCustomPermissions: Record<string, PermissionKey[]> | null = null
let _permLoaded = false // refreshCustomPermissions 是否已完成（無論有無自定義權限）
let _permVersion = 0 // 遞增版號，觸發 usePermission 重新計算

/**
 * 從資料庫加載自定義權限配置
 * 非同步加載，結果存到模組快取中
 */
export async function refreshCustomPermissions(): Promise<void> {
  const user = useAuthStore.getState().user
  const rid = user?.restaurant_id
  try {
    if (!rid) {
      cachedCustomPermissions = null
      return
    }
    const { data, error } = await supabase
      .from('restaurant_roles')
      .select('role_name, permissions')
      .eq('restaurant_id', rid)

    if (error || !data) {
      cachedCustomPermissions = null
      return
    }

    const customMap: Record<string, PermissionKey[]> = {}
    for (const row of data) {
      if (row.permissions && Array.isArray(row.permissions)) {
        customMap[row.role_name] = row.permissions as PermissionKey[]
      }
    }
    cachedCustomPermissions = customMap
  } catch {
    cachedCustomPermissions = null
  } finally {
    _permLoaded = true
    _permVersion++ // 遞增版號，觸發 usePermission 重新計算
  }
}

/**
 * 清除權限快取（強制下次重新加載）
 */
export function clearPermissionCache() {
  cachedCustomPermissions = null
  _permLoaded = false
  _permVersion++
}

/**
 * 同步獲取當前用戶的權限列表（無狀態，無 hook）
 */
function getEffectivePermissions(): PermissionKey[] {
  const user = useAuthStore.getState().user
  if (!user) return []

  // 優先使用資料庫自定義權限
  const custom = cachedCustomPermissions
  if (custom && custom[user.role] && custom[user.role].length > 0) {
    return custom[user.role]
  }

  // 回退到系統默認配置
  return DEFAULT_ROLE_PERMISSIONS[user.role] ?? []
}

/**
 * 細粒度權限控制 hook
 *
 * 優先讀取資料庫自定義權限（restaurant_roles 表），
 * 若無自定義則回退到 DEFAULT_ROLE_PERMISSIONS 默認配置。
 *
 * 用法:
 * const { can } = usePermission()
 * if (can('employee.manage')) { ... }
 * if (can('report.view')) { ... }
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)
  const [permVersion, setPermVersion] = useState(_permVersion)

  // 當 refreshCustomPermissions 完成（遞增版號）時觸發重新渲染
  useEffect(() => {
    if (_permVersion !== permVersion) setPermVersion(_permVersion)
  }, [permVersion])

  // 每 200ms 檢查版號變化（直到與模組級變數同步為止）
  useEffect(() => {
    if (_permVersion === permVersion) return
    const timer = setInterval(() => {
      if (_permVersion !== permVersion) setPermVersion(_permVersion)
    }, 200)
    return () => clearInterval(timer)
  }, [permVersion])

  const userPermissions = useMemo<PermissionKey[]>(() => {
    return getEffectivePermissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permVersion])

  return {
    /** 檢查當前用戶是否擁有某個權限 */
    can: (permission: PermissionKey): boolean => {
      return userPermissions.includes(permission)
    },

    /** 檢查當前用戶是否擁有指定權限列表中的任意一個（OR） */
    canAny: (permissions: PermissionKey[]): boolean => {
      return permissions.some((p) => userPermissions.includes(p))
    },

    /** 檢查當前用戶是否擁有指定權限列表中的全部（AND） */
    canAll: (permissions: PermissionKey[]): boolean => {
      return permissions.every((p) => userPermissions.includes(p))
    },

    /** 獲取當前用戶擁有的所有權限列表 */
    permissions: userPermissions,

    /** 權限是否已從資料庫載入完成（false 則正在載入中） */
    ready: _permLoaded,
  }
}
