import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import type { PermissionKey } from '@/types'
import { DEFAULT_ROLE_PERMISSIONS } from '@/types'

/**
 * 细粒度权限控制 hook
 *
 * 用法:
 * const { can } = usePermission()
 * if (can('employee.manage')) { ... }
 * if (can('report.view')) { ... }
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)

  const userPermissions = useMemo<PermissionKey[]>(() => {
    if (!user) return []
    return DEFAULT_ROLE_PERMISSIONS[user.role] ?? []
  }, [user])

  return {
    /** 检查当前用户是否拥有某个权限 */
    can: (permission: PermissionKey): boolean => {
      return userPermissions.includes(permission)
    },

    /** 检查当前用户是否拥有指定权限列表中的任意一个（OR） */
    canAny: (permissions: PermissionKey[]): boolean => {
      return permissions.some((p) => userPermissions.includes(p))
    },

    /** 检查当前用户是否拥有指定权限列表中的全部（AND） */
    canAll: (permissions: PermissionKey[]): boolean => {
      return permissions.every((p) => userPermissions.includes(p))
    },

    /** 获取当前用户拥有的所有权限列表 */
    permissions: userPermissions,
  }
}
