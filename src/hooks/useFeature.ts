import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useRestaurant } from '@/hooks/useSupabaseData'

/**
 * 功能开关（Feature Flags）hook
 *
 * 每间餐厅可在 restaurants.features JSONB 字段中定义自己启用的功能。
 * 未显式声明启用 = 不开启。
 *
 * 用法:
 * const { isEnabled } = useFeature()
 * if (isEnabled('custom_menu')) { ... }
 * if (isEnabled('ai_customer_chat')) { ... }
 */
export function useFeature() {
  const user = useAuthStore((s) => s.user)
  const { restaurant } = useRestaurant()

  const enabledFeatures = useMemo<Set<string>>(() => {
    if (!restaurant?.features) return new Set()
    if (Array.isArray(restaurant.features)) {
      return new Set(restaurant.features as string[])
    }
    // 兼容 JSONB 对象格式 { feature_name: true }
    const features = restaurant.features as Record<string, boolean>
    return new Set(
      Object.entries(features)
        .filter(([, v]) => v)
        .map(([k]) => k)
    )
  }, [restaurant?.features])

  /** 默认开启的功能集合（全员可用，无需配置） */
  const DEFAULT_FEATURES = new Set([
    'pos',           // POS 点餐
    'products',      // 产品管理
    'inventory',     // 库存
    'orders',        // 订货
    'employees',     // 员工
    'attendance',    // 打卡
    'schedules',     // 排班
    'payroll',       // 薪酬
    'expenses',      // 财务
    'reports',       // 报表
    'settings',      // 设置
  ])

  return {
    /** 检查某个功能是否启用（默认功能 + 餐厅自定义功能） */
    isEnabled: (feature: string): boolean => {
      if (DEFAULT_FEATURES.has(feature)) return true
      if (!user) return false
      return enabledFeatures.has(feature)
    },
  }
}
