import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Search, ShoppingCart, Loader2, RefreshCw, ChevronRight, ChevronDown, FolderOpen, FileSpreadsheet, ImageIcon, Upload, Trash2, CheckSquare, Square, Bell, AlertCircle, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '@/hooks/useSupabaseData'
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData'
import { useRealtimeInventory } from '@/hooks/useRealtime'
import { useSmartOrdering } from '@/hooks/useSmartOrdering'
import { usePermission } from '@/hooks/usePermission'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import * as XLSX from 'xlsx'
import type { Inventory } from '@/types'


function getRestaurantId(): string {
  const user = useAuthStore.getState().user
  return user?.restaurant_id || FALLBACK_RESTAURANT_ID
}

// Warehouse categories from the Excel file
const warehouseCategories = [
  '糖水配料',
  '茶用品',
  '碗/杯/袋/用具',
  '煎餅配料',
  '雜物',
  '雞蛋仔/格餅配料',
]

export function InventoryPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { can } = usePermission()
  const { inventory, loading, refetch, updateInventory, addInventory } = useInventory()
  const { predictions, loading: predictionsLoading } = useSmartOrdering()
  useRealtimeInventory(refetch)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [formData, setFormData] = useState({
    category: '糖水配料',
    name: '',
    unit: '包',
    current_stock: 0,
    min_stock_level: 10,
    supplier: '',
  })

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // 按分類分組
  const categoryMap = new Map<string, Inventory[]>()
  for (const item of filteredInventory) {
    const cat = item.category || '未分類'
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push(item)
  }
  const sortedGroups = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].length - a[1].length)

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // =========== 勾選/刪除 ===========
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      } else {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      }
    })
  }

  const confirmDeleteSelected = () => {
    setShowDeleteConfirm(true)
  }

  const executeDelete = async () => {
    setShowDeleteConfirm(false)
    setDeleting(true)
    try {
      const ids = [...selectedIds]
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)
        const { error } = await supabase
          .from('inventory')
          .delete()
          .in('id', batch)
        if (error) throw error
      }
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      console.error('Delete error:', err)
      alert('刪除失敗: ' + (err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  // =========== 文件導入 ===========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'

    if (isExcel) {
      await handleExcelImport(file)
    } else if (isImage || isPdf) {
      await handleAIImport(file)
    }
    e.target.value = ''
  }

  // ---------- Excel 導入 ----------
  const handleExcelImport = async (file: File) => {
    setImporting(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]

      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

      if (rawRows.length === 0) {
        alert('文件為空，請檢查內容')
        return
      }

      const parsed: any[] = []
      let currentCategory = '雜物'

      for (const row of rawRows) {
        if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) continue

        const colA = String(row[0] || '').trim()
        if (!colA) continue

        const colB = row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== '' ? String(row[1]).trim() : ''
        const isCategoryName = warehouseCategories.includes(colA)

        if (colB || isCategoryName) {
          currentCategory = colA
        } else {
          parsed.push({
            restaurant_id: getRestaurantId(),
            category: currentCategory,
            name: colA,
            unit: '件',
            current_stock: 0,
            min_stock_level: 10,
            supplier: '',
            last_updated: new Date().toISOString(),
          })
        }
      }

      if (parsed.length === 0) {
        alert('未能識別出任何貨物，請確認文件格式')
        return
      }

      const { error } = await supabase.from('inventory').upsert(parsed)
      if (error) {
        alert(`導入失敗: ${error.message}`)
      } else {
        alert(`成功導入 ${parsed.length} 項貨物！`)
        refetch()
      }
    } catch (err) {
      alert('文件解析失敗: ' + (err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  // ---------- AI 圖片/PDF 導入 ----------
  const handleAIImport = async (file: File) => {
    setImporting(true)
    try {
      const reader = new FileReader()
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const response = await fetch('/api/nvidia/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_NVIDIA_NIM_API_KEY}`,
        },
        body: JSON.stringify({
          model: import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: fileData } },
              { type: 'text', text: `你是一個倉庫貨物清單識別助手。請分析這張${file.type === 'application/pdf' ? 'PDF' : '圖片'}中的貨物項目。

請以 JSON 陣列格式回覆，每個項目包含：
{
  "name": "貨物名稱（繁體中文）",
  "category": "分類（如：糖水配料、茶用品、碗/杯/袋/用具、煎餅配料、雜物、雞蛋仔/格餅配料）",
  "unit": "單位（如：包、箱、罐、袋、件）",
  "current_stock": 現有庫存（數字，沒有則為0）,
  "min_stock_level": 最低庫存（數字，沒有則為10）,
  "supplier": "供應商（可省略）"
}

範例輸出：
[
  {"name": "珍珠", "category": "糖水配料", "unit": "包", "current_stock": 50, "min_stock_level": 10},
  {"name": "茶杯", "category": "碗/杯/袋/用具", "unit": "個", "current_stock": 200, "min_stock_level": 50}
]

只回覆 JSON 陣列，不要有其他文字。` }
            ]
          }],
          max_tokens: 2048,
          temperature: 0.1
        })
      })

      if (!response.ok) throw new Error(`API 錯誤: ${response.status}`)

      const data = await response.json()
      const text = data.choices?.[0]?.message?.reasoning_content ||
                   data.choices?.[0]?.message?.content || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('無法解析 AI 回覆')

      const aiItems = JSON.parse(jsonMatch[0])
      if (!Array.isArray(aiItems) || aiItems.length === 0) {
        alert('AI 未能識別出任何貨物，請嘗試其他文件')
        return
      }

      const itemsToInsert = aiItems.map((item: any) => ({
        restaurant_id: getRestaurantId(),
        name: item.name || '未命名',
        category: item.category || '雜物',
        unit: item.unit || '件',
        current_stock: Number(item.current_stock) || 0,
        min_stock_level: Number(item.min_stock_level) || 10,
        supplier: item.supplier || '',
        last_updated: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase
        .from('inventory')
        .insert(itemsToInsert)

      if (insertError) throw insertError

      alert(`AI 成功導入 ${itemsToInsert.length} 項貨物！`)
      refetch()
    } catch (err) {
      console.error('AI 導入失敗:', err)
      alert('AI 導入失敗: ' + (err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  // =========== 新增/編輯 ===========
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    if (editingItem) {
      await updateInventory(editingItem.id, formData)
    } else {
      await addInventory(formData)
    }

    setSaving(false)
    setShowModal(false)
    setEditingItem(null)
    resetForm()
  }

  const handleEdit = (item: Inventory) => {
    setEditingItem(item)
    setFormData({
      category: item.category,
      name: item.name,
      unit: item.unit,
      current_stock: item.current_stock,
      min_stock_level: item.min_stock_level,
      supplier: item.supplier || '',
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      category: '糖水配料',
      name: '',
      unit: '包',
      current_stock: 0,
      min_stock_level: 10,
      supplier: '',
    })
  }

  // =========== 格式化日期 ===========
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const dueItems = predictions.filter(p => p.isDue)
  const anomalyItems = predictions.filter(p => p.isAnomaly)

  return (
    <div className="space-y-6">
      {/* 頂部導航 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-gray-900">貨物表</h1>
          <p className="text-sm text-gray-500 mt-1">管理貨物表</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx,.xls,.csv,.pdf,image/*"
            onChange={handleFileUpload}
          />
          {can('inventory.manage') && (
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {importing ? '導入中...' : '導入貨物'}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/orders')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            訂貨管理
          </Button>
          <Button variant="ghost" size="icon" onClick={refetch} title="即時刷新">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {can('inventory.manage') && (
            <Button onClick={() => { resetForm(); setEditingItem(null); setShowModal(true) }}>
              <Plus className="h-4 w-4 mr-2" />
              新增貨物
            </Button>
          )}
        </div>
      </div>

      {/* 智能訂貨建議面板 */}
      {!predictionsLoading && predictions.length > 0 && (dueItems.length > 0 || anomalyItems.length > 0) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-800">
              <Bell className="h-5 w-5" />
              <span className="font-semibold">智能訂貨建議</span>
            </div>

            {dueItems.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 flex items-center gap-1 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  快到訂貨時間（{dueItems.length} 項）
                </p>
                <div className="flex flex-wrap gap-2">
                  {dueItems.slice(0, 5).map((p) => (
                    <Badge key={p.inventoryId} variant="warning" className="text-xs cursor-default">
                      {p.inventoryName}　上次訂：{formatDate(p.lastOrderDate)} → 預計：{formatDate(p.predictedNextDate!)}（每{p.avgIntervalDays}天一次）
                    </Badge>
                  ))}
                  {dueItems.length > 5 && (
                    <Badge variant="secondary">+{dueItems.length - 5} 更多</Badge>
                  )}
                </div>
              </div>
            )}

            {anomalyItems.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 flex items-center gap-1 mb-2">
                  <Info className="h-4 w-4" />
                  異常訂貨提醒（{anomalyItems.length} 項）
                </p>
                <div className="flex flex-wrap gap-2">
                  {anomalyItems.slice(0, 3).map((p) => (
                    <Badge key={`anomaly-${p.inventoryId}`} variant="destructive" className="text-xs cursor-default">
                      {p.inventoryName}：{p.anomalyReason}
                    </Badge>
                  ))}
                  {anomalyItems.length > 3 && (
                    <Badge variant="secondary">+{anomalyItems.length - 3} 更多</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 數據不足提示 */}
      {!predictionsLoading && predictions.length === 0 && (
        <Card className="border-gray-200 bg-gray-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-600">
              <Bell className="h-5 w-5" />
              <span className="font-medium">智能訂貨建議</span>
              <span className="text-sm text-gray-400 ml-2">— 繼續訂貨，系統會自動學習您的訂貨習慣</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              至少需要累積 2 次以上的訂貨記錄才能開始預測
            </p>
          </CardContent>
        </Card>
      )}

      {/* 搜索與篩選 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜尋貨物名稱..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === '全部' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('全部')}
              >
                全部 ({inventory.length})
              </Button>
              {warehouseCategories.map((cat) => {
                const count = inventory.filter(i => i.category === cat).length
                return (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat} ({count})
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 貨物列表 - 分類展開式 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              貨物列表
              <Badge variant="secondary" className="ml-2 text-sm">
                共 {filteredInventory.length} 項貨物
              </Badge>
            </CardTitle>
            {can('inventory.manage') && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={confirmDeleteSelected} disabled={deleting}>
                {deleting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                刪除所選 ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-2">載入中...</span>
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>{searchTerm || selectedCategory !== '全部' ? '沒有找到符合條件的貨物' : '目前沒有貨物，請點擊上方按鈕導入或手動新增'}</p>
              <p className="text-sm mt-2">
                支援 Excel(.xlsx/.csv)、PDF、圖片 自動導入貨物清單
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedGroups.map(([cat, items]) => {
                const isExpanded = expandedCategories.has(cat)
                return (
                  <div key={cat} className="border rounded-lg overflow-hidden">
                    {/* 分類標題 */}
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                        <span className="font-semibold text-gray-800">{cat}</span>
                        <Badge variant="secondary" className="text-xs">
                          {items.length} 項
                        </Badge>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {/* 展開後的貨物列表 */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <button onClick={() => toggleSelectAll(items.map(i => i.id))} className="flex items-center">
                                  {items.every(i => selectedIds.has(i.id)) ? (
                                    <CheckSquare className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                              </TableHead>
                              <TableHead>貨物名稱</TableHead>
                              <TableHead>供應商</TableHead>
                              <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item) => {
                              const isChecked = selectedIds.has(item.id)
                              return (
                                <TableRow key={item.id} className={`${isChecked ? 'bg-blue-50' : ''}`}>
                                  <TableCell className="w-10">
                                    <button onClick={() => toggleSelect(item.id)} className="flex items-center">
                                      {isChecked ? (
                                        <CheckSquare className="w-4 h-4 text-primary" />
                                      ) : (
                                        <Square className="w-4 h-4 text-gray-400" />
                                      )}
                                    </button>
                                  </TableCell>
                                  <TableCell className="font-medium">{item.name}</TableCell>
                                  <TableCell className="text-gray-500">{item.supplier || '-'}</TableCell>
                                  <TableCell className="text-right">
                                    {can('inventory.manage') && (
                                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增/編輯 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingItem ? '編輯貨物' : '新增貨物'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">類別</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {warehouseCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">貨物名稱</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">單位</label>
                    <Input
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">供應商</label>
                    <Input
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
                    取消
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {editingItem ? '儲存' : '新增'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                確認刪除
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                確定要刪除所選的 <strong>{selectedIds.size}</strong> 項貨物嗎？此操作無法還原。
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  取消
                </Button>
                <Button variant="destructive" onClick={executeDelete}>
                  確認刪除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
