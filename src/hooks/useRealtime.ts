import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type TableName = 'products' | 'categories' | 'inventory' | 'expenses' | 'orders' | 'order_items' | 'settings'

interface UseRealtimeOptions {
  table: TableName
  filter?: string
  onInsert?: (payload: RealtimePostgresChangesPayload<any>) => void
  onUpdate?: (payload: RealtimePostgresChangesPayload<any>) => void
  onDelete?: (payload: RealtimePostgresChangesPayload<any>) => void
  onAll?: (payload: RealtimePostgresChangesPayload<any>) => void
}

/**
 * Supabase Realtime 訂閱 Hook
 * 當 Supabase 中的數據變更時，自動通知回調函數
 * 
 * 使用方式:
 * ```
 * useRealtime({
 *   table: 'inventory',
 *   onAll: () => refetch()
 * })
 * ```
 */
export function useRealtime(options: UseRealtimeOptions) {
  const { table, filter, onInsert, onUpdate, onDelete, onAll } = options
  const channelRef = useRef<any>(null)

  useEffect(() => {
    // 構建訂閱過濾
    const eventConfig: any = { event: '*', schema: 'public', table }

    if (filter) {
      eventConfig.filter = filter
    }

    // 創建渠道
    const channel = supabase
      .channel(`realtime-${table}-${Date.now()}`)
      .on(
        'postgres_changes',
        { ...eventConfig, event: 'INSERT' },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log(`[Realtime] INSERT ${table}:`, payload.new)
          onInsert?.(payload)
          onAll?.(payload)
        }
      )
      .on(
        'postgres_changes',
        { ...eventConfig, event: 'UPDATE' },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log(`[Realtime] UPDATE ${table}:`, payload.new)
          onUpdate?.(payload)
          onAll?.(payload)
        }
      )
      .on(
        'postgres_changes',
        { ...eventConfig, event: 'DELETE' },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log(`[Realtime] DELETE ${table}:`, payload.old)
          onDelete?.(payload)
          onAll?.(payload)
        }
      )
      .subscribe((status: string) => {
        console.log(`[Realtime] ${table} 訂閱狀態:`, status)
      })

    channelRef.current = channel

    return () => {
      console.log(`[Realtime] 取消訂閱 ${table}`)
      supabase.removeChannel(channel)
    }
  }, [table, filter])
}

/**
 * 庫存變更自動刷新 Hook
 * 監聽 inventory 表的變更，自動觸發回調
 */
export function useRealtimeInventory(onChange: () => void) {
  return useRealtime({
    table: 'inventory',
    onAll: onChange
  })
}

/**
 * 開支變更自動刷新 Hook
 */
export function useRealtimeExpenses(onChange: () => void) {
  return useRealtime({
    table: 'expenses',
    onAll: onChange
  })
}

/**
 * 產品變更自動刷新 Hook
 */
export function useRealtimeProducts(onChange: () => void) {
  return useRealtime({
    table: 'products',
    onAll: onChange
  })
}
