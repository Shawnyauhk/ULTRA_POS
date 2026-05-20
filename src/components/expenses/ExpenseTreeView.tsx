import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Calendar, Edit2, Trash2, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Expense, ExpenseCategory } from '@/types'

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: '進貨成本', rent: '租金', utilities: '水電瓦斯',
  salary: '薪資', supplies: '設備雜支', other: '其他',
}

interface YearNode { year: string; total: number; months: MonthNode[] }
interface MonthNode { month: string; total: number; days: DayNode[] }
interface DayNode { date: string; total: number; items: Expense[] }

function buildTree(expenses: Expense[]): YearNode[] {
  const map = new Map<string, Map<string, Map<string, Expense[]>>>()
  for (const e of expenses) {
    if (!e.expense_date) continue
    const [y, m, d] = e.expense_date.split('-')
    if (!y || !m || !d) continue
    if (!map.has(y)) map.set(y, new Map())
    const year = map.get(y)!
    if (!year.has(m)) year.set(m, new Map())
    const month = year.get(m)!
    if (!month.has(d)) month.set(d, [])
    month.get(d)!.push(e)
  }
  const years: YearNode[] = []
  for (const [y, months] of [...map.entries()].sort()) {
    const monthNodes: MonthNode[] = []
    for (const [m, days] of [...months.entries()].sort()) {
      const dayNodes: DayNode[] = []
      for (const [d, items] of [...days.entries()].sort()) {
        dayNodes.push({
          date: `${y}-${m}-${d}`,
          total: items.reduce((s, i) => s + (i.amount || 0), 0),
          items,
        })
      }
      monthNodes.push({
        month: m,
        total: dayNodes.reduce((s, d) => s + d.total, 0),
        days: dayNodes,
      })
    }
    years.push({
      year: y,
      total: monthNodes.reduce((s, m) => s + m.total, 0),
      months: monthNodes,
    })
  }
  return years
}

/** 按供應商將同一天的支出分組 */
function groupBySupplier(items: Expense[]): [string, Expense[]][] {
  const groups = new Map<string, Expense[]>()
  for (const item of items) {
    const key = item.supplier || '其他'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === '其他' ? 1 : b === '其他' ? -1 : a.localeCompare(b)
  )
}

/** 付款狀態徽章 */
function PaymentBadge({ status }: { status?: string }) {
  if (status === 'cash') return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium leading-none">現</span>
  if (status === 'bank') return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium leading-none">銀</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium leading-none">未</span>
}

interface Props {
  expenses: Expense[]
  onEdit?: (expense: Expense) => void
  onDelete?: (id: string) => void
}

export default function ExpenseTreeView({ expenses, onEdit, onDelete }: Props) {
  const tree = useMemo(() => buildTree(expenses), [expenses])
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const toggleYear = (y: string) => {
    setExpandedYears(p => { const n = new Set(p); n.has(y) ? n.delete(y) : n.add(y); return n })
  }
  const toggleMonth = (m: string) => {
    setExpandedMonths(p => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n })
  }
  const toggleDay = (d: string) => {
    setExpandedDays(p => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n })
  }


  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Calendar className="w-12 h-12 mx-auto mb-2 opacity-20" />
        <p>暫無支出記錄</p>
      </div>
    )
  }

  const singleYear = tree.length === 1
  const data = singleYear ? tree[0].months : tree

  // ====== 單筆支出行 ======
  function renderExpenseRow(exp: any) {
    const descLines = (exp.description || '').split('\n').filter(l => {
      const t = l.trim()
      return t && !/^總價?[:：]?\s*\$/.test(t) && !/^供應商[:：]/.test(t) && !/^發票[:：]/.test(t)
    })
    const hasMultiItems = descLines.length > 1

    return (
      <div key={exp.id} className="px-4 sm:px-5 py-2 hover:bg-gray-50 text-sm transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {hasMultiItems ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {CATEGORY_LABELS[exp.category] || exp.category}
                  </Badge>
                  <span className="font-semibold text-gray-900">${exp.amount}</span>
                  <PaymentBadge status={exp.payment_status} />
                </div>
                <div className="space-y-0.5 pl-0.5 mt-1">
                  {descLines.map((line, i) => (
                    <div key={i} className="text-xs text-gray-600 leading-relaxed">{line}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs shrink-0">
                  {CATEGORY_LABELS[exp.category] || exp.category}
                </Badge>
                <span className="text-gray-800 truncate max-w-[180px] sm:max-w-[300px]">{descLines[0] || exp.description || '—'}</span>
                <span className="font-semibold text-gray-900 shrink-0">${exp.amount}</span>
                <PaymentBadge status={exp.payment_status} />
              </div>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0 mt-0.5">
            {onEdit && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(exp); }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(exp.id); }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ====== 供應商分組標題（每天內） ======
  function renderSupplierGroup(supplier: string, items: Expense[]) {
    const groupTotal = items.reduce((s, i) => s + (i.amount || 0), 0)
    return (
      <div key={supplier}>
        {supplier !== '其他' && (
          <div className="sticky top-0 z-10 px-4 sm:px-5 py-1.5 bg-blue-50 flex items-center justify-between border-b border-blue-100">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-semibold text-blue-700">{supplier}</span>
            </div>
            <span className="text-xs font-semibold text-blue-600">${groupTotal.toLocaleString()}</span>
          </div>
        )}
        <div className="divide-y divide-gray-50">
          {items.map(renderExpenseRow)}
        </div>
      </div>
    )
  }

  // ====== 日期層 ======
  function renderDay(day: any) {
    const dayOpen = expandedDays.has(day.date)
    const supplierGroups = groupBySupplier(day.items)
    const hasMultipleSuppliers = supplierGroups.length > 1

    return (
      <div key={day.date}>
        <button onClick={() => toggleDay(day.date)}
          className="w-full flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-gray-50 transition-colors text-left border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            {dayOpen
              ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
              : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
            }
            <span className="text-sm font-medium text-gray-700">{day.date}</span>
            {hasMultipleSuppliers && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                {supplierGroups.length} 供應商
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-blue-600 shrink-0 ml-2">${day.total.toLocaleString()}</span>
        </button>
        {dayOpen && (
          <div className="border-b border-gray-100 bg-white">
            {supplierGroups.length === 1 && supplierGroups[0][0] === '其他'
              ? <div className="divide-y divide-gray-50">{supplierGroups[0][1].map(renderExpenseRow)}</div>
              : supplierGroups.map(([supplier, items]) =>
                  renderSupplierGroup(supplier, items)
                )
            }
          </div>
        )}
      </div>
    )
  }

  // ====== 遞迴渲染年/月/日 ======
  function renderLevel(data: any[], level: number) {
    return (data as any[]).map((node: any) => {
      // 年份層
      if (level === 0) {
        const year = node
        const yearOpen = expandedYears.has(year.year)
        const singleMonth = year.months.length === 1
        return (
          <div key={year.year} className="border border-gray-200 rounded-lg overflow-hidden mb-2 last:mb-0">
            {singleYear && singleMonth ? renderLevel(year.months, 1)
            : singleYear ? <>{renderLevel(year.months, 1)}</>
            : (
              <>
                <button onClick={() => toggleYear(year.year)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    {yearOpen
                      ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    }
                    <span className="font-semibold text-gray-900">{year.year} 年</span>
                    <span className="text-xs text-gray-400">({year.months.length} 個月)</span>
                  </div>
                  <span className="font-bold text-blue-700">${year.total.toLocaleString()}</span>
                </button>
                {yearOpen && (
                  <div className="border-t border-gray-100">{renderLevel(year.months, 1)}</div>
                )}
              </>
            )}
          </div>
        )
      }

      // 月份層
      if (level === 1) {
        const month = node
        const monthKey = `${month.month}`
        const monthOpen = expandedMonths.has(monthKey)
        return (
          <div key={monthKey} className="border-b border-gray-50 last:border-b-0">
            <button onClick={() => toggleMonth(monthKey)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-2">
                {monthOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                }
                <span className="text-sm font-medium text-gray-700">{parseInt(month.month)} 月</span>
                <span className="text-xs text-gray-400">({month.days.length} 天)</span>
              </div>
              <span className="text-sm font-semibold text-blue-600">${month.total.toLocaleString()}</span>
            </button>
            {monthOpen && (
              <div className="border-t border-gray-50">{renderLevel(month.days, 2)}</div>
            )}
          </div>
        )
      }

      // 日期層
      if (level === 2) return renderDay(node)
      return null
    })
  }

  return (
    <div className="space-y-2">
      {renderLevel(data, singleYear ? 1 : 0)}
    </div>
  )
}
