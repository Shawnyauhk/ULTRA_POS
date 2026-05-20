import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Camera, FileText, X, Loader2, CheckCircle2, AlertTriangle,
  Eye, Trash2, Save, Sparkles, Upload, ChevronLeft, ChevronRight, Zap
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useExpenses } from '@/hooks/useSupabaseData'

// ====== 类型定义 ======

const CATEGORY_DISPLAY = [
  { value: 'food', label: '進貨成本' },
  { value: 'rent', label: '租金' },
  { value: 'utilities', label: '水電瓦斯' },
  { value: 'salary', label: '薪資' },
  { value: 'supplies', label: '設備雜支' },
  { value: 'other', label: '其他' },
]

const labelToCategory = (label: string): string =>
  CATEGORY_DISPLAY.find(c => c.label === label)?.value || 'other'

type OCRMode = 'receipt' | 'handwritten'
type ImageStatus = 'pending' | 'processing' | 'done' | 'error'

interface OcrItem {
  name: string
  price: number
  date?: string
  category?: string
}

interface ImageSlot {
  id: string
  file: File
  preview: string
  status: ImageStatus
  error?: string
  ocrText?: string
  items?: OcrItem[]
  supplier?: string
  invoiceNo?: string
  totalAmount?: number
  date?: string
  confirmed?: boolean
}

// ====== 解析逻辑 ======

/**
 * 壓縮圖片：將圖片縮放到 maxDimension 以下，減少 base64 體積
 * 可將 5-10MB 的 WhatsApp 圖片壓縮到 200-500KB
 */
async function compressImage(file: File, maxDimension = 1600, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      // 等比縮放
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * maxDimension / width)
          width = maxDimension
        } else {
          width = Math.round(width * maxDimension / height)
          height = maxDimension
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas 不支持')); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('圖片加載失敗'))
    img.src = URL.createObjectURL(file)
  })
}

interface ParsedData { items: OcrItem[]; supplier: string; invoiceNo: string; date: string }

function parseReceiptText(text: string, mode?: string): ParsedData {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const items: OcrItem[] = []
  let supplier = ''
  let invoiceNo = ''
  let date = ''

  for (const line of lines) {
    if (mode === 'handwritten') {
      const hwMatch = line.match(/^日期:\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}),\s*項目:\s*(.*?),\s*支出:\s*\$?\s*([\d,]+\.?\d*)/)
      if (hwMatch) {
        const itemDate = hwMatch[1].replace(/\//g, '-')
        if (!date) date = itemDate
        const itemName = hwMatch[2].trim() || '雜項'
        const price = parseFloat(hwMatch[3].replace(/,/g, ''))
        if (!isNaN(price) && price > 0) items.push({ name: itemName, price, date: itemDate })
        continue
      }
      if (/^總支出/.test(line)) continue
    }

    const sm = line.match(/^供應商[：:]\s*(.+)/)
    if (sm) { supplier = sm[1].trim(); continue }

    const im = line.match(/^發票[：:]\s*(.+)/)
    if (im) { invoiceNo = im[1].trim(); continue }

    const dm = line.match(/^日期[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/)
    if (dm) { date = dm[1].replace(/\//g, '-'); continue }

    if (/^總價?\s*\$?\s*[\d,]+\.?\d*/.test(line)) continue

    const itemMatch = line.match(/^(.+?)\s*\$?\s*([\d,]+\.?\d*)\s*$/)
    if (!itemMatch) continue
    const name = itemMatch[1].trim()
    const price = parseFloat(itemMatch[2].replace(/,/g, ''))
    if (!name || isNaN(price) || price <= 0) continue
    if (/^(HKD|TOTAL|總額|總數|合計|小計)$/i.test(name)) continue
    if (name.length > 30) continue
    items.push({ name, price })
  }

  return { items, supplier, invoiceNo, date }
}

// ====== 组件 ======

type FlowStep = 'upload' | 'confirm'

export function BatchOCRUpload({ onClose }: { onClose?: () => void }) {
  const { user } = useAuthStore()
  const { createExpense } = useExpenses()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<FlowStep>('upload')
  const [mode, setMode] = useState<OCRMode>('receipt')
  const [slots, setSlots] = useState<ImageSlot[]>([])
  const [processingAll, setProcessingAll] = useState(false)

  // 确认表单共用字段
  const [sharedDate, setSharedDate] = useState(new Date().toISOString().split('T')[0])
  const [sharedCategory, setSharedCategory] = useState('進貨成本')
  const [sharedPayment, setSharedPayment] = useState('')

  // 电脑单逐张预览 index
  const [previewIndex, setPreviewIndex] = useState(0)

  // ====== 选择文件 ======
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newSlots: ImageSlot[] = files.map((file, i) => ({
      id: `img-${Date.now()}-${i}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as ImageStatus,
    }))

    setSlots(prev => [...prev, ...newSlots])
    // clear input for re-select
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // ====== 处理单张（带压缩 + 重试）======
  const processSlot = useCallback(async (slot: ImageSlot, maxRetries = 3): Promise<ImageSlot> => {
    let lastError: string | undefined

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 壓縮圖片以減少 API 處理時間
        const base64 = await compressImage(slot.file, 1600, 0.75)

        let res: Response
        try {
          res = await fetch('/api/ocr/receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mode }),
          })
        } catch (netErr: any) {
          return { ...slot, status: 'error', error: '无法连接后端服务（请确认 npm run server 已启动）' }
        }

        // 检查 HTTP 状态
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          const errMsg = `服务器错误 ${res.status}: ${text.slice(0, 100)}`
          // 504 允許重試
          if (res.status === 504 && attempt < maxRetries) {
            lastError = errMsg
            console.warn(`[OCR] 圖片 ${slot.id} 第 ${attempt} 次返回 504，等待重試...`)
            await new Promise(r => setTimeout(r, 3000 * attempt)) // 遞增等待：3s, 6s
            continue
          }
          return { ...slot, status: 'error', error: errMsg }
        }

        // 安全解析 JSON
        let json: any
        try {
          const rawText = await res.text()
          if (!rawText || rawText.trim() === '') {
            return { ...slot, status: 'error', error: '服务器返回空响应' }
          }
          json = JSON.parse(rawText)
        } catch (parseErr: any) {
          return { ...slot, status: 'error', error: `响应解析失败: ${parseErr.message}` }
        }

        if (!json.success) throw new Error(json.message || '识别失败')

        const text = json.data.text
        const parsed = parseReceiptText(text, mode)
        const totalAmount = parsed.items.reduce((sum, it) => sum + it.price, 0)

        return {
          ...slot,
          status: 'done',
          ocrText: text,
          items: parsed.items,
          supplier: parsed.supplier || slot.supplier,
          invoiceNo: parsed.invoiceNo || slot.invoiceNo,
          totalAmount,
          date: parsed.date || slot.date,
        }
      } catch (err: any) {
        lastError = err.message || '识别失败'
        console.warn(`[OCR] 圖片 ${slot.id} 第 ${attempt} 次失敗: ${lastError}`)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * attempt))
        }
      }
    }

    return { ...slot, status: 'error', error: `${lastError} (已重試 ${maxRetries} 次)` }
  }, [mode])

  // ====== 全部识别（串行 + 压缩 + 自动重试）======
  const handleProcessAll = useCallback(async () => {
    const pending = slots.filter(s => s.status === 'pending')
    if (pending.length === 0) return

    setProcessingAll(true)

    // 串行逐张处理，每张间隔 3 秒避免 API 限流
    for (const slot of pending) {
      // 更新当前为 processing
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'processing' as ImageStatus } : s))

      // processSlot 内部已包含最多 3 次重试
      const result = await processSlot(slot)

      setSlots(prev => prev.map(s => s.id === result.id ? result : s))

      // 每张间隔 3 秒（NVIDIA API 對連續請求較敏感）
      await new Promise(r => setTimeout(r, 3000))
    }

    setProcessingAll(false)
    setStep('confirm')
  }, [slots, processSlot])

  // ====== 删除单张 ======
  const removeSlot = useCallback((id: string) => {
    setSlots(prev => {
      const slot = prev.find(s => s.id === id)
      if (slot) URL.revokeObjectURL(slot.preview)
      return prev.filter(s => s.id !== id)
    })
  }, [])

  // ====== 清空 ======
  const clearAll = useCallback(() => {
    slots.forEach(s => URL.revokeObjectURL(s.preview))
    setSlots([])
    setStep('upload')
  }, [slots])

  // ====== 确认电脑单逐张 ======
  const confirmReceiptSlot = useCallback((id: string) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, confirmed: true } : s))
  }, [])

  // ====== 保存电脑单 ======
  const saveReceipt = useCallback(async (slot: ImageSlot) => {
    if (!sharedPayment) {
      alert('请选择付款状态')
      return false
    }
    try {
      const itemsDesc = (slot.items || []).map(i => `${i.name} $${i.price}`).join('\n')
      let desc = `${itemsDesc}\n總價: $${slot.totalAmount || 0}`
      if (slot.supplier) desc += `\n供應商: ${slot.supplier}`
      if (slot.invoiceNo) desc += `\n發票: ${slot.invoiceNo}`

      const result = await createExpense({
        category: labelToCategory(sharedCategory),
        amount: slot.totalAmount || 0,
        description: desc,
        expense_date: sharedDate,
        payment_status: sharedPayment,
        supplier: slot.supplier || '',
      })
      if (!result.success) throw new Error((result as any).error || '保存失败')
      return true
    } catch (err: any) {
      alert(err.message)
      return false
    }
  }, [sharedPayment, sharedCategory, sharedDate, createExpense])

  // ====== 保存手写单（全部） ======
  const saveAllHandwritten = useCallback(async () => {
    if (!sharedPayment) {
      alert('请选择付款状态')
      return
    }
    const allItems = slots.filter(s => s.status === 'done' && s.items)
    if (allItems.length === 0) return

    for (const slot of allItems) {
      for (const item of slot.items || []) {
        const itemDate = item.date || slot.date || sharedDate
        const desc = `${item.name} $${item.price}` + (slot.supplier ? `\n供應商: ${slot.supplier}` : '')
        await createExpense({
          category: labelToCategory(sharedCategory),
          amount: item.price,
          description: desc,
          expense_date: itemDate,
          payment_status: sharedPayment,
          supplier: slot.supplier || '',
        })
      }
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, confirmed: true } : s))
    }
    alert('全部手写单已保存！')
  }, [sharedPayment, sharedCategory, sharedDate, slots, createExpense])

  // ====== 统计 ======
  const pendingCount = slots.filter(s => s.status === 'pending').length
  const processingCount = slots.filter(s => s.status === 'processing').length
  const doneCount = slots.filter(s => s.status === 'done').length
  const errorCount = slots.filter(s => s.status === 'error').length
  const totalItems = slots.reduce((sum, s) => sum + (s.items?.length || 0), 0)

  return (
    <div className="space-y-4">
      {/* ====== 模式选择 + 上传区 ====== */}
      {step === 'upload' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                批量上传单据
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                  <button onClick={() => setMode('receipt')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'receipt' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    电脑单
                  </button>
                  <button onClick={() => setMode('handwritten')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'handwritten' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    手写单
                  </button>
                </div>
                {onClose && (
                  <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 上传按钮 */}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="font-medium text-sm">
                {mode === 'receipt' ? '点击上传电脑打印收据（可多选）' : '点击上传手写记账本照片（可多选）'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {mode === 'receipt'
                  ? '支持 JPG/PNG，一次可上传多张打印收据，逐张确认'
                  : '支持 JPG/PNG，一次可上传多页手写账簿，批量确认'}
              </p>
            </div>

            {/* 已选文件预览 - 缩略图网格 */}
            {slots.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">已选择 {slots.length} 张图片</span>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <Trash2 className="h-3 w-3 mr-1" /> 清空
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {slots.map(slot => (
                    <div key={slot.id} className="relative group">
                      <img src={slot.preview} className="w-full aspect-square object-cover rounded-lg border bg-gray-50" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSlot(slot.id); }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/30 text-white text-[10px] text-center py-0.5 rounded-b-lg">
                        {slot.file.name.slice(0, 15)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 识别按钮 */}
                <Button
                  onClick={handleProcessAll}
                  disabled={processingAll || pendingCount === 0}
                  className="w-full"
                  size="lg"
                >
                  {processingAll ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5 mr-2" />
                  )}
                  {processingAll
                    ? `逐张识别中 ${doneCount + processingCount}/${slots.length}（含自動重試）...`
                    : `开始批量识别 ${pendingCount} 张图片（自动压缩+重試）`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ====== 确认步骤 ====== */}
      {step === 'confirm' && (
        <>
          {/* 返回按钮 */}
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> 返回上传
            </Button>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {doneCount} 完成</span>
              {processingCount > 0 && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-blue-500" /> {processingCount} 处理中</span>}
              {errorCount > 0 && <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> {errorCount} 失败</span>}
            </div>
          </div>

          {/* 共用配置 */}
          <Card className="mb-4">
            <CardContent className="py-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">分类</label>
                  <Select value={sharedCategory}
                    onValueChange={setSharedCategory}
                    options={CATEGORY_DISPLAY.map(c => ({ value: c.label, label: c.label }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">日期</label>
                  <Input type="date" value={sharedDate} onChange={e => setSharedDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">付款状态</label>
                  <select
                    value={sharedPayment}
                    onChange={e => setSharedPayment(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">-- 请选择 --</option>
                    <option value="cash">现金已付</option>
                    <option value="bank">银行已付</option>
                    <option value="unpaid">未付</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <span className="text-xs text-gray-400">
                    共 {slots.length} 张 · {doneCount} 已识别 · {totalItems} 项
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ==== 电脑单：逐张预览 + 逐一确认 ==== */}
          {mode === 'receipt' && (
            <div className="space-y-4">
              {slots.filter(s => s.status === 'done' || s.status === 'error' || s.status === 'processing').map((slot, idx) => (
                <Card key={slot.id} className={slot.confirmed ? 'opacity-60 border-green-300' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        {slot.confirmed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : slot.status === 'processing' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        ) : slot.status === 'error' ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : null}
                        单据 #{idx + 1}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewIndex(idx)}
                          className="p-1 text-gray-400 hover:text-blue-500 rounded"
                          title="查看大图"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!slot.confirmed && slot.status === 'done' && (
                          <Button size="sm" onClick={() => confirmReceiptSlot(slot.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> 确认
                          </Button>
                        )}
                        {!slot.confirmed && (
                          <Button size="sm" variant="ghost" onClick={() => saveReceipt(slot)}>
                            <Save className="h-3 w-3 mr-1" /> 单独保存
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-4">
                      {/* 小图预览 */}
                      <img src={slot.preview} className="w-24 h-24 object-cover rounded-lg border bg-gray-50 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1">
                        {slot.status === 'processing' && (
                          <p className="text-sm text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 正在识别...</p>
                        )}
                        {slot.status === 'error' && (
                          <p className="text-sm text-red-500"><AlertTriangle className="h-3 w-3 inline mr-1" />{slot.error}</p>
                        )}
                        {slot.status === 'done' && slot.items && (
                          <>
                            {slot.supplier && <p className="text-xs text-blue-600 font-medium">{slot.supplier}</p>}
                            {slot.invoiceNo && <p className="text-xs text-gray-400">发票: {slot.invoiceNo}</p>}
                            {slot.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-700">{item.name}</span>
                                <span className="font-medium">${item.price}</span>
                              </div>
                            ))}
                            <div className="border-t pt-1 text-sm font-bold text-blue-700">
                              总计: ${slot.totalAmount}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* 批量保存已确认的 */}
              {slots.some(s => s.confirmed && s.status === 'done') && (
                <Button className="w-full" size="lg" onClick={async () => {
                  const confirmed = slots.filter(s => s.confirmed && s.status === 'done')
                  for (const slot of confirmed) await saveReceipt(slot)
                  alert(`已保存 ${confirmed.length} 张单据！`)
                }}>
                  <Save className="h-4 w-4 mr-2" />
                  一键保存所有已确认单据 ({slots.filter(s => s.confirmed).length} 张)
                </Button>
              )}
            </div>
          )}

          {/* ==== 手写单：全部列表一次性确认 ==== */}
          {mode === 'handwritten' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  手写单识别结果汇总（{totalItems} 项）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b">
                      <tr>
                        <th className="text-left py-2 px-2">来源</th>
                        <th className="text-left py-2 px-2">日期</th>
                        <th className="text-left py-2 px-2">项目</th>
                        <th className="text-right py-2 px-2">金额</th>
                        <th className="text-center py-2 px-2 w-16">预览</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slots.filter(s => s.status === 'done' || s.status === 'error' || s.status === 'processing').flatMap(slot => {
                        if (slot.status === 'processing') {
                          return [(
                            <tr key={slot.id} className="border-b bg-blue-50">
                              <td colSpan={5} className="py-2 px-2 text-blue-500 text-xs">
                                <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                                正在识别 {slot.file.name.slice(0, 20)}...
                              </td>
                            </tr>
                          )]
                        }
                        if (slot.status === 'error') {
                          return [(
                            <tr key={slot.id} className="border-b bg-red-50">
                              <td colSpan={5} className="py-2 px-2 text-red-500 text-xs">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {slot.file.name.slice(0, 20)}: {slot.error}
                              </td>
                            </tr>
                          )]
                        }
                        return (slot.items || []).map((item, i) => (
                          <tr key={`${slot.id}-${i}`} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2 text-xs text-gray-400">{slot.file.name.slice(0, 12)}</td>
                            <td className="py-2 px-2 text-xs">{item.date || slot.date || sharedDate}</td>
                            <td className="py-2 px-2">{item.name}</td>
                            <td className="py-2 px-2 text-right font-medium">${item.price}</td>
                            <td className="py-2 px-2 text-center">
                              {i === 0 && (
                                <button onClick={() => setPreviewIndex(slots.indexOf(slot))} className="text-gray-400 hover:text-blue-500">
                                  <Eye className="h-3 w-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-sm">
                        <td colSpan={3} className="py-2 px-2 text-right">总计: {totalItems} 项</td>
                        <td className="py-2 px-2 text-right text-blue-700">
                          ${slots.filter(s => s.status === 'done').reduce((sum, s) => sum + (s.totalAmount || 0), 0)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end mt-4">
                  <Button size="lg" onClick={saveAllHandwritten} disabled={doneCount === 0}>
                    <Save className="h-4 w-4 mr-2" />
                    一键保存全部 ({totalItems} 项)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 图片大图预览层 */}
          {slots[previewIndex] && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPreviewIndex(-1)}>
              <div className="max-w-xl max-h-[90vh] mx-4 relative" onClick={e => e.stopPropagation()}>
                <img src={slots[previewIndex].preview} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-xl" />
                <button onClick={() => setPreviewIndex(-1)} className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow">
                  <X className="h-4 w-4" />
                </button>
                <div className="flex justify-center gap-2 mt-2">
                  <button
                    onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                    disabled={previewIndex === 0}
                    className="bg-white/80 rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-white text-sm self-center">{previewIndex + 1} / {slots.length}</span>
                  <button
                    onClick={() => setPreviewIndex(prev => Math.min(slots.length - 1, prev + 1))}
                    disabled={previewIndex === slots.length - 1}
                    className="bg-white/80 rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 底部操作栏 */}
      {step === 'confirm' && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={clearAll}>全部清除</Button>
        </div>
      )}
    </div>
  )
}
