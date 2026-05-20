import { useMemo } from 'react'

interface DateRangeFilterProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
}

/** 快捷選項：{ label, 計算函數 } */
const QUICK_OPTIONS = [
  {
    label: '今天',
    compute: (): [string, string] => {
      const t = new Date()
      const s = t.toISOString().split('T')[0]
      return [s, s]
    },
  },
  {
    label: '昨天',
    compute: (): [string, string] => {
      const t = new Date(Date.now() - 86400000)
      const s = t.toISOString().split('T')[0]
      return [s, s]
    },
  },
  {
    label: '前天',
    compute: (): [string, string] => {
      const t = new Date(Date.now() - 2 * 86400000)
      const s = t.toISOString().split('T')[0]
      return [s, s]
    },
  },
  {
    label: '本星期',
    compute: (): [string, string] => {
      const now = new Date()
      const day = now.getDay() // 0=Sun
      const diffToMon = day === 0 ? 6 : day - 1 // 回到星期一
      const mon = new Date(now)
      mon.setDate(now.getDate() - diffToMon)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]]
    },
  },
  {
    label: '本月',
    compute: (): [string, string] => {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return [first.toISOString().split('T')[0], last.toISOString().split('T')[0]]
    },
  },
]

export default function DateRangeFilter({ startDate, endDate, onChange }: DateRangeFilterProps) {
  /** 判斷快捷按鈕是否為 active 狀態 */
  const activeQuickLabel = useMemo(() => {
    const cand = QUICK_OPTIONS.find(({ compute }) => {
      const [s, e] = compute()
      return s === startDate && e === endDate
    })
    return cand?.label ?? null
  }, [startDate, endDate])

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* 開始日期 */}
      <div className="flex flex-col gap-1 min-w-0">
        <label className="text-xs font-medium text-gray-500">開始</label>
        <input
          type="date"
          value={startDate}
          onChange={e => onChange(e.target.value, endDate)}
          className="w-[140px] border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <span className="text-gray-400 pb-1.5 text-sm">—</span>

      {/* 結束日期 */}
      <div className="flex flex-col gap-1 min-w-0">
        <label className="text-xs font-medium text-gray-500">結束</label>
        <input
          type="date"
          value={endDate}
          onChange={e => onChange(startDate, e.target.value)}
          className="w-[140px] border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* 快捷按鈕 */}
      <div className="flex items-center gap-1 pb-1">
        {QUICK_OPTIONS.map(({ label, compute }) => {
          const isActive = activeQuickLabel === label
          return (
            <button
              key={label}
              onClick={() => {
                const [s, e] = compute()
                onChange(s, e)
              }}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
