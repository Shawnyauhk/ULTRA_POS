import { useMemo } from 'react'
import { useOrderRequests } from './useSupabaseData'

export interface OrderPrediction {
  inventoryId: string
  inventoryName: string
  unit: string
  lastOrderDate: string
  avgIntervalDays: number
  predictedNextDate: string | null
  daysUntilNext: number | null
  isDue: boolean
  isAnomaly: boolean
  anomalyReason: string | null
  orderCount: number
  /** 1-10, 越高越緊急/重要 */
  priority: number
}

export function useSmartOrdering() {
  const { orderRequests, loading } = useOrderRequests()

  const predictions = useMemo<OrderPrediction[]>(() => {
    // 只分析已完成的訂貨記錄（排除 pending、rejected）
    const completedStatuses = ['approved', 'ordered', 'partial', 'received']
    const completed = orderRequests.filter(r => completedStatuses.includes(r.status))

    if (completed.length < 2) return []

    // 按 inventory_id 分組
    const groups = new Map<string, {
      name: string
      unit: string
      dates: Date[]
    }>()

    for (const req of completed) {
      const items = req.items || []
      if (items.length === 0) continue
      const item = items[0]
      const invId = item.inventory_id
      const invName = item.inventory?.name || '未知貨物'
      const unit = item.inventory?.unit || '件'

      if (!groups.has(invId)) {
        groups.set(invId, { name: invName, unit, dates: [] })
      }
      groups.get(invId)!.dates.push(new Date(req.created_at))
    }

    const today = new Date()
    const results: OrderPrediction[] = []

    for (const [invId, group] of groups) {
      // 排序日期（舊到新）
      const sorted = group.dates.sort((a, b) => a.getTime() - b.getTime())

      if (sorted.length < 2) continue

      // 計算間隔天數
      const intervals: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        const diffDays = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
        intervals.push(diffDays)
      }

      const avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      const lastDate = sorted[sorted.length - 1]

      // 預測下次訂貨日期
      const predictedDate = new Date(lastDate.getTime() + avgInterval * 24 * 60 * 60 * 1000)
      const daysUntilNext = Math.round((predictedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // 檢查異常：某次間隔 < 平均週期 * 0.3
      let anomalyReason: string | null = null
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] < avgInterval * 0.3) {
          const anomalyDate = sorted[i + 1]
          const prevDate = sorted[i]
          const daysBetween = Math.round(intervals[i])
          anomalyReason = `上次訂貨 (${formatShortDate(prevDate)}) 後僅 ${daysBetween} 天又再訂，比平均 ${avgInterval} 天短很多`
          break
        }
      }

      // 計算優先級
      let priority = 5
      if (daysUntilNext <= 3) priority = 10
      else if (daysUntilNext <= 7) priority = 8
      else if (daysUntilNext <= 14) priority = 6
      if (anomalyReason) priority = Math.max(priority, 7)

      results.push({
        inventoryId: invId,
        inventoryName: group.name,
        unit: group.unit,
        lastOrderDate: lastDate.toISOString(),
        avgIntervalDays: avgInterval,
        predictedNextDate: predictedDate.toISOString(),
        daysUntilNext,
        isDue: daysUntilNext <= 3,
        isAnomaly: anomalyReason !== null,
        anomalyReason,
        orderCount: sorted.length,
        priority,
      })
    }

    // 按優先級排序
    return results.sort((a, b) => b.priority - a.priority)
  }, [orderRequests])

  return { predictions, loading }
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}
