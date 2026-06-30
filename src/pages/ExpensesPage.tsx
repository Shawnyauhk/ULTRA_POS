import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, Calendar, 
  Trash2, Sparkles, User, Edit2, Save, X, Calculator, RefreshCw, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  DollarSign, ShieldCheck, Banknote, BarChart3
} from 'lucide-react';
import { useExpenses } from '@/hooks/useSupabaseData';
import { useRealtimeExpenses } from '@/hooks/useRealtime';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { supabase, apiFetch } from '@/lib/supabase';
import { recognizeReceipt } from '@/lib/ocr';
import SettlementPage from './SettlementPage';

// ====== 分類映射（中文 ↔ DB 英文） ======
const CATEGORY_DISPLAY: { value: string; label: string }[] = [
  { value: 'food', label: '進貨成本' },
  { value: 'rent', label: '租金' },
  { value: 'utilities', label: '水電瓦斯' },
  { value: 'salary', label: '薪資' },
  { value: 'supplies', label: '設備雜支' },
  { value: 'other', label: '其他' },
];

const categoryToLabel = (cat: string): string =>
  CATEGORY_DISPLAY.find(c => c.value === cat)?.label || cat;

const shortCategory = (cat: string): string => {
  const label = categoryToLabel(cat);
  return label === '進貨成本' ? '進貨' : label;
};

// 分類顏色映射
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  food: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  rent: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  utilities: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  salary: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  supplies: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
  other: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
};

const shortSupplier = (name: string): string => {
  if (!name) return '—';
  const cleaned = name.replace(/[（(].*?[)）]/g, '').trim();
  const cn = cleaned.match(/^[\u4e00-\u9fff]+/)?.[0] || '';
  if (!cn) return cleaned.slice(0, 2) || '—';
  if (cn.length >= 3 && cn[2] === '仔') return cn.slice(0, 3);
  return cn.slice(0, 2);
};

const cleanDescription = (desc: string): string =>
  (desc || '').replace(/\(經手人:.*\)/g, '').trim() || '—';

const labelToCategory = (label: string): string =>
  CATEGORY_DISPLAY.find(c => c.label === label)?.value || 'other';

// ====== 定義前端顯示用的介面 ======
interface FormExpense {
  category: string;
  amount: number;
  description: string;
  invoice: string;
  handler: string;
  expense_date: string;
  payment_status: string;
  supplier: string;
}

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement' | 'cash_settlement' | 'safe'>('expenses');
  const { can } = usePermission();
  const { user } = useAuthStore();

  // Supabase Hook
  const { expenses, loading, refetch, createExpense, updateExpense, deleteExpense } = useExpenses();
  
  // 即時同步：當其他裝置修改開支時自動刷新
  useRealtimeExpenses(refetch);

  // UI State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<any>>({});
  const [saving, setSaving] = useState(false);

  // Settlement State（對應 POSPAL 「门店销售汇总」欄位）
  const initialSettlement = {
    cash: '', octopus: '', foodpanda: '', alipay_hk: '', wechat_hk: '',
    meituan_keeta: '', openrice: '',
    total_amount: '', actual_revenue: '', total_transactions: '',
  };
  const [settlement, setSettlement] = useState<Record<string, string>>({...initialSettlement});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [settlementDays, setSettlementDays] = useState<number>(0);
  const [settlementRecords, setSettlementRecords] = useState<any[]>([]);

  // ===== 篩選器狀態 =====
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string[]>([]);
  const [expandedFilterSections, setExpandedFilterSections] = useState<Set<string>>(new Set());
  const toggleSection = (section: string) => {
    const next = new Set(expandedFilterSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedFilterSections(next);
  };
  const PAYMENT_OPTIONS = [
    { value: 'cash', label: '現金已付' },
    { value: 'bank', label: '銀行已付' },
    { value: 'unpaid', label: '未付' },
  ];

  // 載入該月份的結算數據（彙總）
  useEffect(() => {
    loadMonthlySettlement(month);
  }, [month]);

  const loadMonthlySettlement = async (m: string) => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSettlementLoading(true);
    try {
      const res = await fetch(`/api/settlements/monthly?month=${m}&restaurant_id=${rid}`);
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        setSettlement({
          cash: s.cash?.toString() || '',
          octopus: s.octopus?.toString() || '',
          foodpanda: s.foodpanda?.toString() || '',
          alipay_hk: s.alipay_hk?.toString() || '',
          wechat_hk: s.wechat_hk?.toString() || '',
          meituan_keeta: s.meituan_keeta?.toString() || '',
          openrice: s.openrice?.toString() || '',
          total_amount: s.total_amount?.toString() || '',
          actual_revenue: s.actual_revenue?.toString() || '',
          total_transactions: s.total_transactions?.toString() || '',
        });
        setSettlementDays(s.days || 0);
        setSettlementRecords(json.records || []);
      } else {
        setSettlement({...initialSettlement});
        setSettlementDays(0);
        setSettlementRecords([]);
      }
    } catch (e) {
      console.error('載入月度結算失敗:', e);
    } finally {
      setSettlementLoading(false);
    }
  };

  // 展開/收起月結記錄
  const [showMonthlyRecords, setShowMonthlyRecords] = useState(false);

  const handleSyncPOSPAL = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSyncing(true);
    setSyncStatus(null);
    // POSPAL 爬蟲以單日為單位，用該月份第一天作為代表日期
    const syncDate = `${month}-01`;
    try {
      const res = await fetch('/api/settlements/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: rid, date: syncDate }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncStatus(`✅ 同步完成: 總金額 $${json.data?.total_amount || 0}`);
        loadMonthlySettlement(month);
      } else {
        setSyncStatus(`❌ 同步失敗: ${json.message}`);
      }
    } catch (e: any) {
      setSyncStatus(`❌ 同步錯誤: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // AI OCR States
  const [showOCR, setShowOCR] = useState(false);
  const [ocrMode, setOcrMode] = useState<'receipt' | 'handwritten'>('receipt');
  const [ocrModel, setOcrModel] = useState<'qwen' | 'llama'>('qwen');
  const [ocrProcessingModel, setOcrProcessingModel] = useState<string>('');
  const [ocrActualModel, setOcrActualModel] = useState<string>('');
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<FormExpense | null>(null);
  const [ocrHandwrittenEntries, setOcrHandwrittenEntries] = useState<FormExpense[]>([]);
  const [editingEntryIndex, setEditingEntryIndex] = useState(-1);
  const [expandedEntryIndex, setExpandedEntryIndex] = useState<number | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string | null>(null); // 壓縮後的 base64，用於上傳
  const [lightboxImage, setLightboxImage] = useState<string | null>(null); // 放大查看
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return new Set([`year:${y}`, `month:${y}-${m}`]);
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 檢測是否為手機
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const [newExpense, setNewExpense] = useState<FormExpense>({
    category: '進貨成本',
    amount: 0,
    description: '',
    handler: useAuthStore.getState().user?.name || '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_status: '',
    supplier: '',
  });

  const handleAddExpense = async () => {
    if (!newExpense.payment_status) {
      setErrorMessage('請選擇付款狀態（現金已付 / 銀行已付 / 未付）');
      return;
    }
    setSaving(true);
    const expenseData = {
      category: labelToCategory(newExpense.category),
      amount: newExpense.amount,
      description: newExpense.description,
      handler: newExpense.handler,
      expense_date: newExpense.expense_date,
      payment_status: newExpense.payment_status,
      supplier: newExpense.supplier,
    };
    const result = await createExpense(expenseData);
    if (!result.success) setErrorMessage('新增支出失敗：' + (result as any).error);
    setSaving(false);
    setShowAddForm(false);
    setNewExpense({
      category: '進貨成本', amount: 0, description: '', handler: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_status: '', supplier: '',
    });
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    const updates: any = {};
    if (editForm.category) updates.category = labelToCategory(editForm.category);
    if (editForm.amount !== undefined) updates.amount = editForm.amount;
    if (editForm.description !== undefined) updates.description = editForm.description;
    if (editForm.expense_date) updates.expense_date = editForm.expense_date;
    if (editForm.payment_status) updates.payment_status = editForm.payment_status;
    if (editForm.supplier !== undefined) updates.supplier = editForm.supplier;
    if (editForm.handler !== undefined) updates.handler = editForm.handler;
    const success = await updateExpense(id, updates);
    if (!success) setErrorMessage('更新支出失敗');
    setSaving(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null);
    const success = await deleteExpense(id);
    if (!success) setErrorMessage('刪除支出失敗');
  };

  /**
   * 讀取圖片的 EXIF orientation，返回需要旋轉的角度
   * 手機拍照後 EXIF orientation 可能是 1-8，需要正確處理
   */
  const getExifOrientation = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target?.result as ArrayBuffer);
          // 檢查是否為 JPEG
          if (view.getUint16(0, false) !== 0xFFD8) { resolve(1); return; }
          let offset = 2;
          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;
            if (marker === 0xFFE1) { // APP1 (EXIF)
              const length = view.getUint16(offset, false);
              offset += 2;
              // 檢查 EXIF 標識
              const exifId = String.fromCharCode(
                view.getUint8(offset), view.getUint8(offset+1),
                view.getUint8(offset+2), view.getUint8(offset+3),
                view.getUint8(offset+4)
              );
              if (exifId === 'Exif\0') {
                // 找到 Orientation tag (tag 0x0112)
                const tiffOffset = offset + 6;
                const little = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, little);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, little);
                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
                  const tag = view.getUint16(entryOffset, little);
                  if (tag === 0x0112) { // Orientation
                    const orientation = view.getUint16(entryOffset + 8, little);
                    resolve(orientation || 1);
                    return;
                  }
                }
              }
              offset += length - 2;
            } else if (marker === 0xFFDA || marker === 0xFFD9) {
              break;
            } else {
              offset += view.getUint16(offset, false) - 2;
            }
          }
          resolve(1);
        } catch {
          resolve(1);
        }
      };
      reader.onerror = () => resolve(1);
      reader.readAsArrayBuffer(file.slice(0, 65536)); // 只讀前 64KB 找 EXIF
    });
  };

  /**
   * 根據 EXIF orientation 旋轉 canvas
   * orientation: 1=正常, 3=180°, 6=90°CW, 8=90°CCW
   */
  const applyOrientation = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, orientation: number): void => {
    const width = canvas.width, height = canvas.height;
    if (orientation <= 1) return;

    // 暫存原始圖片
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(canvas, 0, 0);

    // 根據 orientation 變換 canvas 尺寸
    if (orientation >= 5) {
      canvas.width = height;
      canvas.height = width;
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.save();
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, height, width); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
    }
    ctx.drawImage(tempCanvas, 0, 0, width, height);
    ctx.restore();
  };

  /** 增強圖片對比度（手機拍照光線不均時很有用） */
  const enhanceContrast = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const len = data.length;

      // === 步驟 1: 灰度化 + 自動色階 ===
      let min = 255, max = 0;
      for (let i = 0; i < len; i += 4) {
        // 加权灰度化
        const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        data[i] = data[i+1] = data[i+2] = gray;
        if (gray < min) min = gray;
        if (gray > max) max = gray;
      }

      // 自動色階拉伸（限制 1% 裁剪避免噪點干擾）
      const range = max - min;
      if (range > 10) {
        const lowCut = min + range * 0.01;
        const highCut = max - range * 0.01;
        const factor = 255 / (highCut - lowCut + 1);
        for (let i = 0; i < len; i += 4) {
          const v = data[i];
          const stretched = Math.min(255, Math.max(0, (v - lowCut) * factor));
          data[i] = data[i+1] = data[i+2] = Math.round(stretched);
        }
      }

      // === 步驟 2: Sharpen 銳化 ===
      // 複製一份原始像素
      const orig = new Uint8ClampedArray(data);
      const w = canvas.width;
      // 3x3 sharpen kernel
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          let r = 0, g = 0, b = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const k = kernel[(ky + 1) * 3 + (kx + 1)];
              const pixelIdx = ((y + ky) * w + (x + kx)) * 4;
              r += orig[pixelIdx] * k;
              g += orig[pixelIdx + 1] * k;
              b += orig[pixelIdx + 2] * k;
            }
          }
          data[idx]     = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
        }
      }

      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      // 如果增強失敗，忽略（不影響主流程）
      console.warn('[OCR] 圖片增強跳過:', e);
    }
  };

  /** 壓縮圖片：處理 EXIF 方向 + 對比度增強 + 手機優化 */
  const compressImageFromUrl = (objectUrl: string, orientation: number = 1): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 手機用 1000px/0.65 品質，桌機用 1280px/0.70（降低解析度加快識別速度）
        const maxDimension = isMobile ? 1000 : 1280;
        const quality = isMobile ? 0.65 : 0.70;
        let { width, height } = img;

        // 先根據 orientation 交換寬高（orientation >= 5 表示需要交換寬高）
        let targetW = width, targetH = height;
        if (orientation >= 5) { [targetW, targetH] = [targetH, targetW]; }

        if (targetW > maxDimension || targetH > maxDimension) {
          if (targetW > targetH) {
            targetH = Math.round(targetH * maxDimension / targetW);
            targetW = maxDimension;
          } else {
            targetW = Math.round(targetW * maxDimension / targetH);
            targetH = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 不支援')); return; }

        // 先繪製並壓縮
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // 應用 EXIF 方向旋轉
        if (orientation > 1) {
          applyOrientation(canvas, ctx, orientation);
        }

        // 增強對比度
        enhanceContrast(canvas, ctx);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('圖片加載失敗'));
      img.src = objectUrl;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 清空 input value，允許重新選擇同一個檔案
    e.target.value = '';
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setExpandedEntryIndex(null);
    setOcrProcessing(true);
    setErrorMessage('');

    try {
      // 使用 createObjectURL 避免超大 base64 記憶體問題（手機照片可達 20-50MB）
      const objectUrl = URL.createObjectURL(file);
      setOcrPreview(objectUrl);

      // 讀取 EXIF orientation（手機拍照必須處理）
      const orientation = await getExifOrientation(file);
      console.log(`[OCR] EXIF orientation: ${orientation}`);

      console.log(`[OCR] 開始壓縮圖片 (手機: ${isMobile}, 原始大小: ${(file.size/1024).toFixed(0)}KB, orientation: ${orientation})...`);

      // 壓縮圖片再發送（傳入 orientation）
      const compressed = await compressImageFromUrl(objectUrl, orientation);

      // 釋放 object URL
      URL.revokeObjectURL(objectUrl);

      console.log(`[OCR] 壓縮完成: ${(compressed.length/1024).toFixed(0)}KB, 模式: ${ocrMode}, 模型: ${ocrModel}`);
      // 保存壓縮後的圖片用於後續上傳儲存
      setOcrImageDataUrl(compressed);

      // === 開始 AI 識別（使用 Gemini，直接在前端呼叫，無需後端，永不過期）===
      console.log(`[OCR] 調用 Gemini (${ocrMode} 模式)...`);
      setOcrProcessingModel('Gemini 2.0 Flash');
      setOcrActualModel('gemini-2.0-flash');

      const ocrResult = await recognizeReceipt(compressed, ocrMode);

      if (!ocrResult || !ocrResult.rawText) {
        throw new Error('OCR 識別失敗');
      }

      const text = ocrResult.rawText;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (ocrMode === 'handwritten') {
          // === 手寫記賬本模式：解析多筆支出，支援日/月 與 YYYY-MM-DD 格式 ===
          const entries: FormExpense[] = [];
          let currentDate = '';
          let lastYear = new Date().getFullYear(); // 預設今年，有完整年/月時更新
          let detectedMonth = -1; // 從第一個有月份的日期檢測

          for (const line of lines) {
            // 跳過總計行
            if (/^總支出|^總價|^總金額/.test(line)) continue;

            // 嘗試匹配完整日期：日期: 2026-04-08, 項目: XXX, 支出: $Y
            let m = line.match(/^日期[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})[,\s]*項目[：:]\s*(.*?)[,\s]*支出[：:]\s*\$?\s*([\d,]+\.?\d*)/);
            if (m) {
              const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
              currentDate = `${y}-${mo}-${d}`;
              lastYear = parseInt(y);
              if (detectedMonth < 0) detectedMonth = parseInt(mo);
              entries.push({
                amount: parseFloat(m[5].replace(/,/g, '')),
                expense_date: currentDate,
                category: '進貨成本',
                description: m[4].trim() || '手寫支出',
                handler: 'AI',
                payment_status: 'cash',
                supplier: '手寫單',
              });
              continue;
            }

            // 嘗試匹配日/月格式：日期: 8/4, 項目: XXX, 支出: $Y
            m = line.match(/^日期[：:]\s*(\d{1,2})\s*[\/]\s*(\d{1,2})[,\s]*項目[：:]\s*(.*?)[,\s]*支出[：:]\s*\$?\s*([\d,]+\.?\d*)/);
            if (m) {
              const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0');
              if (detectedMonth < 0) detectedMonth = parseInt(month);
              currentDate = `${lastYear}-${month}-${day}`;
              entries.push({
                amount: parseFloat(m[4].replace(/,/g, '')),
                expense_date: currentDate,
                category: '進貨成本',
                description: m[3].trim() || '手寫支出',
                handler: 'AI',
                payment_status: 'cash',
                supplier: '手寫單',
              });
              continue;
            }

            // 嘗試匹配只有日期和金額的簡化行：日期: 8/4, 支出: $26
            m = line.match(/^日期[：:]\s*(\d{1,2})\s*[\/]\s*(\d{1,2})[,\s]*支出[：:]\s*\$?\s*([\d,]+\.?\d*)/);
            if (m) {
              const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0');
              if (detectedMonth < 0) detectedMonth = parseInt(month);
              currentDate = `${lastYear}-${month}-${day}`;
              entries.push({
                amount: parseFloat(m[3].replace(/,/g, '')),
                expense_date: currentDate,
                category: '進貨成本',
                description: '',
                handler: 'AI',
                payment_status: 'cash',
                supplier: '手寫單',
              });
              continue;
            }

            // 嘗試匹配 YYYY-MM-DD 完整日期簡化行：日期: 2026-04-08, 支出: $26
            m = line.match(/^日期[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})[,\s]*支出[：:]\s*\$?\s*([\d,]+\.?\d*)/);
            if (m) {
              const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
              lastYear = parseInt(y);
              if (detectedMonth < 0) detectedMonth = parseInt(mo);
              currentDate = `${y}-${mo}-${d}`;
              entries.push({
                amount: parseFloat(m[4].replace(/,/g, '')),
                expense_date: currentDate,
                category: '進貨成本',
                description: '',
                handler: 'AI',
                payment_status: 'cash',
                supplier: '手寫單',
              });
              continue;
            }

            // 嘗試匹配日期行（無項目/金額），更新 currentDate：日期: 8/4
            m = line.match(/^日期[：:]\s*(\d{1,2})\s*[\/]\s*(\d{1,2})/);
            if (m) {
              const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0');
              if (detectedMonth < 0) detectedMonth = parseInt(month);
              currentDate = `${lastYear}-${month}-${day}`;
              continue;
            }

            // 嘗試匹配日期行（YYYY-MM-DD 格式）
            m = line.match(/^日期[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (m) {
              const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
              lastYear = parseInt(y);
              if (detectedMonth < 0) detectedMonth = parseInt(mo);
              currentDate = `${y}-${mo}-${d}`;
              continue;
            }

            // 有 $ 符號的項目行（無日期前綴），依附到 currentDate
            m = line.match(/^\s*品名\s*\$?\s*([\d,]+\.?\d*)/);
            if (m && currentDate) {
              entries.push({
                amount: parseFloat(m[1].replace(/,/g, '')),
                expense_date: currentDate,
                category: '進貨成本',
                description: '',
                handler: 'AI',
                payment_status: 'cash',
                supplier: '手寫單',
              });
              continue;
            }
          }

          // 如果都沒有檢測到月份，使用當前月份
          if (detectedMonth < 0) detectedMonth = new Date().getMonth() + 1;

          // 如果全部未匹配到日期，使用第一個檢測到的月份作為當月 1 日
          if (entries.length === 0) {
            const fallbackDate = `${lastYear}-${String(detectedMonth).padStart(2, '0')}-01`;
            entries.push({
              amount: 0,
              expense_date: fallbackDate,
              category: '進貨成本',
              description: '手寫支出（無法解析）',
              handler: 'AI',
              payment_status: 'cash',
              supplier: '手寫單',
            });
          }

          setOcrHandwrittenEntries(entries);
        } else {
          // === 收據模式：解析單筆支出 ===
          let supplier = '';
          let description = '';
          let amount = 0;
          let expense_date = new Date().toISOString().split('T')[0];
          let invoice = '';

          let category = '進貨成本';

          for (const line of lines) {
            // 清理 markdown 格式（**粗體**）
            const cleanLine = line.replace(/\*\*/g, '').trim();

            // 提取分類（新增）
            const cm = cleanLine.match(/^分類[：:]\s*(.+)/);
            if (cm) { category = cm[1].trim(); continue; }

            // 提取供應商
            const sm = cleanLine.match(/^供應商[：:]\s*(.+)/);
            if (sm) { supplier = sm[1].trim(); continue; }

            // 提取日期
            const dm = cleanLine.match(/^日期[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
            if (dm) { expense_date = dm[1].replace(/\//g, '-'); continue; }

            // 提取發票
            const im = cleanLine.match(/^發票[：:]\s*(.+)/);
            if (im) { invoice = im[1].trim(); continue; }

            // 提取品項列表（新版格式：品項: 品名1 $價格1, 品名2 $價格2）
            const itemMatch = cleanLine.match(/^品項[：:]\s*(.+)/);
            if (itemMatch) {
              description = itemMatch[1].trim();
              continue;
            }

            // 提取總價（支援「總價: $XXX」「總價 $XXX」格式）
            const tm = cleanLine.match(/^總價[：:]?\s*\$?\s*([\d,]+\.?\d*)/);
            if (tm) {
              amount = parseFloat(tm[1].replace(/,/g, ''));
              continue;
            }
          }

          // 如果沒有「品項:」欄位，嘗試從舊格式「品名 $價格」收集
          if (!description) {
            const items: string[] = [];
            for (const line of lines) {
              const cleanLine = line.replace(/\*\*/g, '').trim();
              const m = cleanLine.match(/^(.+?)\s+\$([\d,]+\.?\d*)\s*$/);
              if (m && !cleanLine.match(/^總價/)) {
                items.push(m[1].trim());
              }
            }
            if (items.length > 0) description = items.join(', ');
          }

          // ===== AI 智能分類：食物/食材相關一律歸入「進貨成本」=====
          const foodKeywords = ['蛋', '奶', '肉', '菜', '魚', '蝦', '米', '麵', '粉', '糖', '油',
            '鹽', '醬', '醋', '酒', '茶', '豆', '果', '瓜', '薑', '葱', '蒜', '雪糕',
            '包', '餅', '糕', '腸', '丸', '卷', '角', '春卷', '點心', '凍肉',
            '冰鮮', '蔬果', '生果', '海鮮', '家禽', '扒類', '水產', '臘味',
            '副食品', '食材', '食品', '雜貨', '零食', '飲料', '飲品',
            '急凍', '冷藏', '奶類製品', '蛋類', '罐頭', '調味料', '香料'];
          if (category !== '進貨成本' && (
            foodKeywords.some(k => description?.includes(k)) ||
            foodKeywords.some(k => supplier?.includes(k))
          )) {
            category = '進貨成本';
          }

          // 描述只包含品項，不包含發票號
          setOcrResult({
            amount,
            expense_date,
            category,
            description: description || text.slice(0, 200),
            invoice,
            handler: 'AI',
            payment_status: '',
            supplier,
          });
        }
    } catch (outerErr: any) {
      console.error('[OCR] 檔案處理錯誤:', outerErr);
      setErrorMessage('照片處理失敗: ' + (outerErr?.message || outerErr?.toString() || '未知錯誤'));
      setOcrPreview(null);
      setOcrProcessing(false);
    }
  };

  const handleOCRConfirm = async () => {
    if (!ocrResult) return;
    if (!ocrResult.payment_status) {
      setErrorMessage('請選擇付款狀態（現金已付 / 銀行已付 / 未付）');
      return;
    }
    setSaving(true);

    // 上傳圖片到後台
    let receiptUrl = '';
    if (ocrImageDataUrl) {
      try {
        const uploadRes = await fetch('/api/ocr/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: ocrImageDataUrl }),
        });
        const uploadJson = await uploadRes.json();
        if (uploadJson.success) {
          receiptUrl = uploadJson.data.url;
        }
      } catch (uploadErr) {
        console.warn('[OCR] 圖片上傳失敗，不影響儲存:', uploadErr);
      }
    }

    const expenseData = {
      category: labelToCategory(ocrResult.category),
      amount: ocrResult.amount,
      description: ocrResult.description,
      invoice: ocrResult.invoice || '',
      expense_date: ocrResult.expense_date,
      payment_status: ocrResult.payment_status,
      supplier: ocrResult.supplier || '',
      receipt_url: receiptUrl || '',
    };
    const result = await createExpense(expenseData);
    if (!result.success) setErrorMessage('OCR 保存失敗：' + (result as any).error);
    setSaving(false);
    setShowOCR(false);
    setOcrPreview(null);
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setOcrImageDataUrl(null);
    setOcrProcessing(false);
    setOcrProcessingModel('');
    setEditingEntryIndex(-1);
    setExpandedEntryIndex(null);
  };

  /** 批量保存手寫記賬本的支出條目 */
  const handleBatchOCRConfirm = async () => {
    if (ocrHandwrittenEntries.length === 0) return;
    const unpaid = ocrHandwrittenEntries.filter(e => !e.payment_status);
    if (unpaid.length > 0) {
      setErrorMessage(`尚有 ${unpaid.length} 筆未選擇付款狀態`);
      return;
    }
    setSaving(true);

    // 上傳圖片到後台
    let receiptUrl = '';
    if (ocrImageDataUrl) {
      try {
        const uploadRes = await fetch('/api/ocr/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: ocrImageDataUrl }),
        });
        const uploadJson = await uploadRes.json();
        if (uploadJson.success) {
          receiptUrl = uploadJson.data.url;
        }
      } catch (uploadErr) {
        console.warn('[OCR] 圖片上傳失敗，不影響儲存:', uploadErr);
      }
    }

    let failed = 0;
    for (const entry of ocrHandwrittenEntries) {
      const result = await createExpense({
        category: labelToCategory(entry.category),
        amount: entry.amount,
        description: entry.description,
        invoice: entry.invoice || '',
        expense_date: entry.expense_date,
        payment_status: entry.payment_status,
        supplier: entry.supplier || '',
        receipt_url: receiptUrl || '',
      });
      if (!result.success) failed++;
    }
    if (failed > 0) {
      setErrorMessage(`保存完成，${failed} 筆失敗`);
    }
    setSaving(false);
    setShowOCR(false);
    setOcrPreview(null);
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setOcrImageDataUrl(null);
    setOcrProcessing(false);
    setOcrProcessingModel('');
    setEditingEntryIndex(-1);
    setExpandedEntryIndex(null);
  };

  // ========== 收銀箱日結 State ==========
  const [cashDate, setCashDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashRegister, setCashRegister] = useState({
    id: '',
    opening_balance: 1500,
    pos_cash_income: 0,
    cash_expenses: 0,
    expected_balance: 0,
    actual_counted: 0 as number | null,
    retained_balance: 1500,
    deposited_safe: 0,
    difference: 0,
    status: 'pending',
    notes: '',
  });
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashNotified, setCashNotified] = useState(false);
  const [showCashReport, setShowCashReport] = useState(false);

  // 載入收銀箱資料
  const loadCashRegister = async (d: string) => {
    const rid = useAuthStore.getState().user?.restaurant_id;
    if (!rid) return;
    setCashLoading(true);
    try {
      const { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('restaurant_id', rid)
        .eq('date', d)
        .maybeSingle();

      // 計算當日 POS 現金收入（從 settlement 的 cash 欄位）
      let posCash = 0;
      try {
        const res = await fetch(`/api/settlements?date=${d}&restaurant_id=${rid}`);
        const json = await res.json();
        if (json.success && json.data) {
          posCash = parseFloat(json.data.cash) || 0;
        }
      } catch { /* ignore */ }

      // 計算當日現金開支（expenses 中 payment_status = 'cash'）
      const { data: cashExps } = await supabase
        .from('expenses')
        .select('amount')
        .eq('restaurant_id', rid)
        .eq('expense_date', d)
        .eq('payment_status', 'cash');

      const totalCashExps = (cashExps || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const expected = 1500 + posCash - totalCashExps;
      const deposited = expected > 1500 ? expected - 1500 : 0;

      if (existing) {
        setCashRegister({
          id: existing.id,
          opening_balance: Number(existing.opening_balance) || 1500,
          pos_cash_income: posCash,
          cash_expenses: totalCashExps,
          expected_balance: expected,
          actual_counted: existing.actual_counted ? Number(existing.actual_counted) : null,
          retained_balance: existing.retained_balance ? Number(existing.retained_balance) : 1500,
          deposited_safe: existing.deposited_safe ? Number(existing.deposited_safe) : 0,
          difference: Number(existing.difference) || 0,
          status: existing.status || 'pending',
          notes: existing.notes || '',
        });
      } else {
        setCashRegister({
          id: '',
          opening_balance: 1500,
          pos_cash_income: posCash,
          cash_expenses: totalCashExps,
          expected_balance: expected,
          actual_counted: null,
          retained_balance: 1500,
          deposited_safe: 0,
          difference: 0,
          status: 'pending',
          notes: '',
        });
      }
    } catch (err) {
      console.error('載入收銀箱資料失敗:', err);
    } finally {
      setCashLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'cash_settlement') loadCashRegister(cashDate);
  }, [activeTab, cashDate]);

  const handleSaveCashRegister = async () => {
    const uid = useAuthStore.getState().user?.id;
    const rid = useAuthStore.getState().user?.restaurant_id;
    if (!rid || !uid) return;
    setCashSaving(true);
    try {
      const actual = Number(cashRegister.actual_counted || 0);
      const retained = Number(cashRegister.retained_balance || 1500);
      const deposited = Number(cashRegister.deposited_safe || 0);
      const diff = actual - cashRegister.expected_balance;

      const payload = {
        restaurant_id: rid,
        date: cashDate,
        opening_balance: 1500,
        pos_cash_income: cashRegister.pos_cash_income,
        cash_expenses: cashRegister.cash_expenses,
        expected_balance: cashRegister.expected_balance,
        actual_counted: actual,
        retained_balance: retained,
        deposited_safe: deposited,
        difference: diff,
        status: 'done',
        counted_by: uid,
        counted_at: new Date().toISOString(),
        notes: cashRegister.notes,
        created_by: uid,
      };

      if (cashRegister.id) {
        await supabase.from('cash_register').update(payload).eq('id', cashRegister.id);
      } else {
        await supabase.from('cash_register').insert([payload]);
      }

      // 差異 >= 100 發送通知
      if (Math.abs(diff) >= 100 && !cashNotified) {
        setCashNotified(true);
        fetch('/api/whatsapp/notify-cash-diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: rid,
            date: cashDate,
            expected: cashRegister.expected_balance,
            actual,
            difference: diff,
          }),
        }).catch(() => {});
      }

      await loadCashRegister(cashDate);
      setMessage({ type: 'success', text: '現金日結已儲存' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('儲存現金日結失敗:', err);
      setMessage({ type: 'error', text: '儲存失敗' });
    } finally {
      setCashSaving(false);
    }
  };

  // 支出詳情展開
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);

  // ========== 保險箱彈窗 State ==========
  const [showSafePopup, setShowSafePopup] = useState(false);
  const [safePopupData, setSafePopupData] = useState<{
    deposits: any[];
    summary: { [month: string]: number };
    totalDeposited: number;
  }>({ deposits: [], summary: {}, totalDeposited: 0 });
  const [safePopupLoading, setSafePopupLoading] = useState(false);

  const loadSafePopupData = async () => {
    const rid = useAuthStore.getState().user?.restaurant_id;
    if (!rid) return;
    setSafePopupLoading(true);
    try {
      const { data: deposits } = await supabase
        .from('safe_deposits')
        .select('*')
        .eq('restaurant_id', rid)
        .order('date', { ascending: false })
        .limit(100);
      const all = deposits || [];
      // 按月分類歸檔
      const summary: { [month: string]: number } = {};
      let total = 0;
      for (const d of all) {
        const m = d.date ? d.date.substring(0, 7) : '未知';
        summary[m] = (summary[m] || 0) + Number(d.amount || 0);
        total += Number(d.amount || 0);
      }
      setSafePopupData({ deposits: all, summary, totalDeposited: total });
      setShowSafePopup(true);
    } catch (err) {
      console.error('載入保險箱資料失敗:', err);
    } finally {
      setSafePopupLoading(false);
    }
  };

  // ========== 保險箱 State ==========
  const [safeMonth, setSafeMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [safeRecords, setSafeRecords] = useState<any[]>([]);
  const [safeReconciliation, setSafeReconciliation] = useState<any>(null);
  const [safeLoading, setSafeLoading] = useState(false);
  const [safeReconcileMode, setSafeReconcileMode] = useState(false);
  const [safeActual, setSafeActual] = useState<number>(0);

  const loadSafeData = async (month: string) => {
    const rid = useAuthStore.getState().user?.restaurant_id;
    if (!rid) return;
    setSafeLoading(true);
    try {
      const [year, mon] = month.split('-');
      const monthStart = `${year}-${mon}-01`;
      const monthEnd = new Date(Number(year), Number(mon), 0).toISOString().split('T')[0];

      // 查該月存入記錄
      const { data: deposits } = await supabase
        .from('safe_deposits')
        .select('*')
        .eq('restaurant_id', rid)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false });
      setSafeRecords(deposits || []);

      // 查該月核對
      const { data: reconcile } = await supabase
        .from('safe_reconciliation')
        .select('*')
        .eq('restaurant_id', rid)
        .eq('month', monthStart)
        .maybeSingle();
      setSafeReconciliation(reconcile || null);
      setSafeActual(reconcile?.actual_counted || 0);
    } catch (err) {
      console.error('載入保險箱資料失敗:', err);
    } finally {
      setSafeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'safe') loadSafeData(safeMonth);
  }, [activeTab, safeMonth]);

  const handleSaveSafeReconciliation = async () => {
    const uid = useAuthStore.getState().user?.id;
    const rid = useAuthStore.getState().user?.restaurant_id;
    if (!rid || !uid) return;
    setCashSaving(true);
    try {
      const monthStart = `${safeMonth}-01`;
      const totalDeposited = safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const diff = safeActual - totalDeposited;

      if (safeReconciliation?.id) {
        await supabase.from('safe_reconciliation').update({
          expected_balance: totalDeposited,
          actual_counted: safeActual,
          difference: diff,
          reconciled_by: uid,
          reconciled_at: new Date().toISOString(),
          notes: '',
        }).eq('id', safeReconciliation.id);
      } else {
        await supabase.from('safe_reconciliation').insert([{
          restaurant_id: rid,
          month: monthStart,
          expected_balance: totalDeposited,
          actual_counted: safeActual,
          difference: diff,
          reconciled_by: uid,
          reconciled_at: new Date().toISOString(),
        }]);
      }

      await loadSafeData(safeMonth);
      setSafeReconcileMode(false);
      setMessage({ type: 'success', text: '保險箱核對已儲存' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('儲存保險箱核對失敗:', err);
      setMessage({ type: 'error', text: '儲存失敗' });
    } finally {
      setCashSaving(false);
    }
  };

  // === 過濾後的支出 ===
  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter((exp: any) => {
      if (filterDateFrom && exp.expense_date < filterDateFrom) return false;
      if (filterDateTo && exp.expense_date > filterDateTo) return false;
      if (filterCategories.length > 0 && !filterCategories.includes(exp.category)) return false;
      if (filterSupplier && exp.supplier !== filterSupplier) return false;
      if (filterPaymentStatus.length > 0 && !filterPaymentStatus.includes(exp.payment_status)) return false;
      return true;
    });
  }, [expenses, filterDateFrom, filterDateTo, filterCategories, filterSupplier, filterPaymentStatus]);

  // === 供應商列表（用於下拉篩選）===
  const supplierOptions = useMemo(() => {
    if (!expenses) return [];
    const suppliers = [...new Set(expenses.map((e: any) => e.supplier).filter(Boolean))];
    return suppliers.sort((a, b) => a.localeCompare(b, 'zh-HK'));
  }, [expenses]);

  // === 預計算支出樹形結構（年→月→日）===
  const expenseTree = useMemo(() => {
    if (!filteredExpenses || filteredExpenses.length === 0) return { groups: [], total: 0, totalCount: 0 };
    const sorted = [...filteredExpenses].sort((a: any, b: any) =>
      (b.expense_date || '').localeCompare(a.expense_date || '')
    );
    const yearMap = new Map<string, Map<string, Map<string, any[]>>>();
    sorted.forEach((exp: any) => {
      const parts = (exp.expense_date || '').split('-');
      const y = parts[0] || '?';
      const m = parts[1] ? `${y}-${parts[1]}` : `${y}-?`;
      const day = parts[2] ? exp.expense_date : m + '-?';
      if (!yearMap.has(y)) yearMap.set(y, new Map());
      if (!yearMap.get(y)!.has(m)) yearMap.get(y)!.set(m, new Map());
      if (!yearMap.get(y)!.get(m)!.has(day)) yearMap.get(y)!.get(m)!.set(day, []);
      yearMap.get(y)!.get(m)!.get(day)!.push(exp);
    });
    const groups: { year: string; yearKey: string; yEntries: any[]; yTotal: number;
      months: { month: string; monthKey: string; mEntries: any[]; mTotal: number;
        days: { day: string; entries: any[]; dTotal: number }[] }[] }[] = [];
    for (const y of Array.from(yearMap.keys()).sort().reverse()) {
      const months: typeof groups[0]['months'] = [];
      for (const m of Array.from(yearMap.get(y)!.keys()).sort().reverse()) {
        const monthMap = yearMap.get(y)!.get(m)!;
        const days: typeof months[0]['days'] = [];
        for (const d of Array.from(monthMap.keys()).sort().reverse()) {
          const entries = monthMap.get(d)!;
          days.push({ day: d, entries, dTotal: entries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) });
        }
        const mEntries = days.flatMap(d => d.entries);
        months.push({ month: m, monthKey: `month:${m}`, mEntries, mTotal: mEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0), days });
      }
      const yEntries = months.flatMap(m => m.mEntries);
      groups.push({ year: y, yearKey: `year:${y}`, yEntries, yTotal: yEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0), months });
    }
    return { groups, total: sorted.reduce((s: number, e: any) => s + Number(e.amount || 0), 0), totalCount: sorted.length };
  }, [expenses]);

  return (
    <div className="px-1 md:px-3 space-y-2 md:space-y-3 max-w-full">
      <div className="flex flex-col gap-1 md:gap-2 md:flex-row md:items-center md:justify-between px-1">
        <div className="min-w-0">
          <h1 className="text-base md:text-xl font-bold text-gray-900">門店收支</h1>
          <p className="text-xs text-muted-foreground">支出記錄、營業額結算、現金日結與保險箱管理</p>
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg self-start md:self-auto flex-nowrap overflow-x-auto">
          <Button variant={activeTab === 'expenses' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('expenses')} className="h-7 text-xs px-2">門店支出</Button>
          {can('settlement.view') && (
            <Button variant={activeTab === 'settlement' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('settlement')} className="h-7 text-xs px-2">營業額結算</Button>
          )}
          {can('expense.cash_settlement') && (
            <Button variant={activeTab === 'cash_settlement' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('cash_settlement')} className="h-7 text-xs px-2">
              <DollarSign className="w-3 h-3 mr-1" />現金日結
            </Button>
          )}
          {can('safe.view') && (
            <Button variant={activeTab === 'safe' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('safe')} className="h-7 text-xs px-2">
              <ShieldCheck className="w-3 h-3" />保險箱
            </Button>
          )}

        </div>
      </div>

      {activeTab === 'expenses' ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex gap-2 justify-end">
            {!showOCR && can('expense.manage') && (
              <Button onClick={() => setShowAddForm(true)}><Receipt className="w-4 h-4 mr-2" /> 手動記帳</Button>
            )}
            {!showAddForm && (
              <Button variant="outline" onClick={() => setShowOCR(!showOCR)}><Sparkles className="w-4 h-4 mr-2" /> AI 掃描收據</Button>
            )}
          </div>

          {showOCR && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>智能識別</CardTitle>
                  <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                    <button
                      onClick={() => { setOcrMode('receipt'); setOcrResult(null); setOcrHandwrittenEntries([]); setEditingEntryIndex(-1); setExpandedEntryIndex(null); }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${ocrMode === 'receipt' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >收據掃描</button>
                    <button
                      onClick={() => { setOcrMode('handwritten'); setOcrResult(null); setOcrHandwrittenEntries([]); setEditingEntryIndex(-1); setExpandedEntryIndex(null); }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${ocrMode === 'handwritten' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >手寫記帳</button>
                  </div>
                </div>
                <CardDescription>
                  {ocrMode === 'receipt' ? '上傳收據照片，AI 自動辨識品項與金額' : '上傳手寫記賬本照片，AI 自動提取多筆支出'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                {isMobile && <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />}
                {!ocrPreview ? (
                  <>
                    {ocrProcessing ? (
                      <div className="flex flex-col items-center justify-center p-8">
                        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                        <p className="text-sm text-gray-500">{ocrProcessingModel ? `${ocrProcessingModel} 識別中...` : '正在處理圖片，請稍候...'}</p>
                        <p className="text-xs text-gray-400 mt-1">手機照片較大，壓縮可能需要幾秒鐘</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                          <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                          <p>{ocrMode === 'receipt' ? '從相簿選擇收據照片' : '從相簿選擇手寫記賬本照片'}</p>
                          <p className="text-xs text-gray-400 mt-1">或</p>
                        </div>
                        {isMobile && (
                          <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center cursor-pointer hover:border-green-400 transition-colors bg-green-50/30" onClick={() => cameraInputRef.current?.click()}>
                            <Camera className="w-10 h-10 mx-auto text-green-500 mb-2" />
                            <p className="text-green-700 font-medium">📸 直接拍照</p>
                            <p className="text-xs text-green-500 mt-1">使用相機拍攝收據</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <img
                      src={ocrPreview}
                      alt="Preview"
                      className="w-full max-h-64 object-contain rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxImage(ocrImageDataUrl || ocrPreview)}
                    />
                    <div className="space-y-4">
                      {ocrHandwrittenEntries.length > 0 ? (
                        // === 手寫模式：按日期分組表格顯示，可編輯 ===
                        <>
                          <p className="font-medium">識別到 {ocrHandwrittenEntries.length} 筆支出：</p>
                          {(() => {
                            // 按日期分組
                            const groups: { date: string; entries: { entry: FormExpense; idx: number }[] }[] = [];
                            const dateMap = new Map<string, { entry: FormExpense; idx: number }[]>();
                            ocrHandwrittenEntries.forEach((entry, idx) => {
                              const d = entry.expense_date;
                              if (!dateMap.has(d)) dateMap.set(d, []);
                              dateMap.get(d)!.push({ entry, idx });
                            });
                            // 日期排序
                            const sortedDates = Array.from(dateMap.keys()).sort().reverse();
                            for (const d of sortedDates) {
                              groups.push({ date: d, entries: dateMap.get(d)! });
                            }
                            const totalAmount = ocrHandwrittenEntries.reduce((s, e) => s + e.amount, 0);

                            const updateField = (idx: number, field: keyof FormExpense, value: any) => {
                              const updated = [...ocrHandwrittenEntries];
                              (updated[idx] as any)[field] = value;
                              setOcrHandwrittenEntries(updated);
                            };

                            // 格式化顯示日期
                            const fmtDate = (d: string) => {
                              const parts = d.split('-');
                              if (parts.length === 3) {
                                return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
                              }
                              return d;
                            };
                            // 顯示日期組標題（如「4月8日」）
                            const fmtGroupTitle = (d: string) => {
                              const parts = d.split('-');
                              if (parts.length === 3) {
                                return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
                              }
                              return d;
                            };

                            return (
                              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {groups.map((group) => (
                                  <div key={group.date} className="border rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 border-b">
                                      📅 {fmtGroupTitle(group.date)}（{group.entries.length} 筆）
                                    </div>
                                    <div className="divide-y">
                                      {group.entries.map(({ entry, idx }) => (
                                        <div key={idx} className="px-3 py-2 space-y-1.5 text-sm">
                                          {editingEntryIndex === idx ? (
                                            // === 編輯模式 ===
                                            <div className="space-y-2">
                                              <div className="flex gap-2">
                                                <input
                                                  type="text"
                                                  value={entry.expense_date}
                                                  onChange={(e) => updateField(idx, 'expense_date', e.target.value)}
                                                  className="w-28 border rounded px-2 py-1 text-xs"
                                                  placeholder="YYYY-MM-DD"
                                                />
                                                <input
                                                  type="number"
                                                  value={entry.amount}
                                                  onChange={(e) => updateField(idx, 'amount', parseFloat(e.target.value) || 0)}
                                                  className="w-24 border rounded px-2 py-1 text-xs"
                                                  placeholder="金額"
                                                />
                                              </div>
                                              <input
                                                type="text"
                                                value={entry.description}
                                                onChange={(e) => updateField(idx, 'description', e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs"
                                                placeholder="項目描述"
                                              />
                                              <div className="flex gap-2">
                                                <select
                                                  value={entry.category}
                                                  onChange={(e) => updateField(idx, 'category', e.target.value)}
                                                  className="flex-1 border rounded px-2 py-1 text-xs"
                                                >
                                                  {CATEGORY_DISPLAY.map(c => (
                                                    <option key={c.value} value={c.label}>{c.label}</option>
                                                  ))}
                                                </select>
                                                <select
                                                  value={entry.payment_status}
                                                  onChange={(e) => updateField(idx, 'payment_status', e.target.value)}
                                                  className="flex-1 border rounded px-2 py-1 text-xs"
                                                >
                                                  <option value="">付款狀態</option>
                                                  <option value="cash">現金已付</option>
                                                  <option value="bank">銀行已付</option>
                                                  <option value="unpaid">未付</option>
                                                </select>
                                                <button
                                                  onClick={() => setEditingEntryIndex(-1)}
                                                  className="px-2 py-1 text-green-600 hover:bg-green-50 rounded"
                                                  title="完成編輯"
                                                ><Save className="w-3.5 h-3.5" /></button>
                                              </div>
                                            </div>
                                          ) : (
                                            // === 檢視模式 ===
                                            <>
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="text-gray-400 text-xs shrink-0">{fmtDate(entry.expense_date)}</span>
                                                  <span className="truncate">{entry.description || '—'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                  <span className="font-semibold">${entry.amount}</span>
                                                  <span className={`text-xs px-1.5 py-0.5 rounded ${entry.payment_status === 'cash' ? 'bg-green-100 text-green-700' : entry.payment_status === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {entry.payment_status === 'cash' ? '現金' : entry.payment_status === 'bank' ? '銀行' : '未付'}
                                                  </span>
                                                  <button
                                                    onClick={() => setExpandedEntryIndex(expandedEntryIndex === idx ? null : idx)}
                                                    className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                                                    title="詳情"
                                                  >{expandedEntryIndex === idx ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</button>
                                                  <button
                                                    onClick={() => setEditingEntryIndex(idx)}
                                                    className="p-1 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50"
                                                    title="編輯"
                                                  ><Edit2 className="w-3 h-3" /></button>
                                                </div>
                                              </div>
                                              <select
                                                value={entry.payment_status}
                                                onChange={(e) => updateField(idx, 'payment_status', e.target.value)}
                                                className="w-full border rounded px-2 py-1 text-xs"
                                              >
                                                <option value="">-- 付款狀態 --</option>
                                                <option value="cash">現金已付</option>
                                                <option value="bank">銀行已付</option>
                                                <option value="unpaid">未付</option>
                                              </select>
                                              {expandedEntryIndex === idx && (
                                                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                                                  <div className="flex justify-between">
                                                    <span>項目</span>
                                                    <span className="text-gray-700 text-right max-w-[70%] break-words">{entry.description || '—'}</span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span>供應商</span>
                                                    <span className="text-gray-700">{entry.supplier || '—'}</span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span>分類</span>
                                                    <span className="text-gray-700">{entry.category}</span>
                                                  </div>
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="bg-gray-50 px-3 py-1.5 text-right text-xs text-gray-500 border-t">
                                      小計：${group.entries.reduce((s, { entry }) => s + entry.amount, 0)}
                                    </div>
                                  </div>
                                ))}
                                <div className="text-sm text-gray-600 font-medium text-right pt-1">
                                  共 {ocrHandwrittenEntries.length} 筆　總金額：${totalAmount}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex gap-2">
                            <Button onClick={handleBatchOCRConfirm} disabled={saving} className="flex-1">
                              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              批量添加到資料庫 ({ocrHandwrittenEntries.length} 筆)
                            </Button>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>重新上傳</Button>
                          </div>
                        </>
                      ) : ocrResult ? (
                        // === 收據模式：單筆支出（所有欄位可即時編輯） ===
                        <>
                          <p className="font-medium mb-2">解析結果（可即時編輯）：</p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium">日期</label>
                              <input type="date" value={ocrResult.expense_date}
                                onChange={(e) => setOcrResult({ ...ocrResult, expense_date: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">金額</label>
                              <input type="number" step="0.01" min="0" value={ocrResult.amount}
                                onChange={(e) => setOcrResult({ ...ocrResult, amount: parseFloat(e.target.value) || 0 })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">分類</label>
                              <select value={ocrResult.category}
                                onChange={(e) => setOcrResult({ ...ocrResult, category: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1">
                                {CATEGORY_DISPLAY.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-sm font-medium">供應商</label>
                              <input type="text" value={ocrResult.supplier || ''}
                                onChange={(e) => setOcrResult({ ...ocrResult, supplier: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1" placeholder="輸入供應商名稱" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">發票號碼</label>
                              <input type="text" value={ocrResult.invoice || ''}
                                onChange={(e) => setOcrResult({ ...ocrResult, invoice: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1" placeholder="無發票號碼則留空" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">描述</label>
                              <input type="text" value={ocrResult.description || ''}
                                onChange={(e) => setOcrResult({ ...ocrResult, description: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1" placeholder="支出項目描述" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">付款狀態</label>
                              <select
                                value={ocrResult.payment_status}
                                onChange={(e) => setOcrResult({ ...ocrResult, payment_status: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                              >
                                <option value="">-- 請選擇 --</option>
                                <option value="cash">現金已付</option>
                                <option value="bank">銀行已付</option>
                                <option value="unpaid">未付</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button onClick={handleOCRConfirm} disabled={saving} className="flex-1">
                              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              確認添加到資料庫
                            </Button>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>重新上傳</Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                          <span className="ml-2">AI 正在解析收據...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showAddForm && (
            <Card>
              <CardHeader><CardTitle>新增支出</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-4 gap-4">
                  <div>
                    <label>金額 (HKD)</label>
                    <Input type="number" value={newExpense.amount || ''}
                      onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <label>日期</label>
                    <Input type="date" value={newExpense.expense_date || ''}
                      onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})} />
                  </div>
                  <div>
                    <label>分類</label>
                    <Select value={newExpense.category}
                      onValueChange={v => setNewExpense({...newExpense, category: v})}
                      options={CATEGORY_DISPLAY.map(c => ({ value: c.label, label: c.label }))} />
                  </div>
                  <div>
                    <label>供應商</label>
                    <Input value={newExpense.supplier || ''}
                      onChange={e => setNewExpense({...newExpense, supplier: e.target.value})} />
                  </div>
                  <div>
                    <label>描述</label>
                    <Input value={newExpense.description || ''}
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
                  </div>
                  <div>
                    <label>經手人</label>
                    <Input value={newExpense.handler || useAuthStore.getState().user?.name || ''}
                      readOnly className="bg-gray-50 text-gray-600 cursor-default" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">付款狀態</label>
                    <select
                      value={newExpense.payment_status}
                      onChange={(e) => setNewExpense({...newExpense, payment_status: e.target.value })}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">-- 請選擇 --</option>
                      <option value="cash">現金已付</option>
                      <option value="bank">銀行已付</option>
                      <option value="unpaid">未付</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>取消</Button>
                  <Button onClick={handleAddExpense} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    新增
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 支出列表 */}
          <Card className="shadow-sm">
            <CardHeader className="px-3 py-2 md:px-4 md:py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm md:text-base">支出記錄</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}
                  className={`text-xs h-6 px-2 ${showFilters ? 'bg-blue-50 text-blue-600' : ''}`}>
                  <BarChart3 className="w-3.5 h-3.5 mr-1" />
                  篩選
                  {(filterDateFrom || filterDateTo || filterCategories.length > 0 || filterSupplier || filterPaymentStatus.length > 0) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-1" />
                  )}
                </Button>
              </div>
              {/* 篩選器列 - 兩層式摺疊面板 */}
              {showFilters && (
                <div className="mt-2 border border-gray-100 rounded-md overflow-hidden text-xs">
                  {/* === 日期 === */}
                  <div className="border-b border-gray-50">
                    <button onClick={() => toggleSection('date')}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        日期
                        {(filterDateFrom || filterDateTo) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </span>
                      {expandedFilterSections.has('date') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {expandedFilterSections.has('date') && (
                      <div className="px-3 pb-2 flex items-center gap-1">
                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                          className="w-28 md:w-32 px-1.5 py-1 border border-gray-200 rounded text-xs" />
                        <span className="text-gray-300">~</span>
                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                          className="w-28 md:w-32 px-1.5 py-1 border border-gray-200 rounded text-xs" />
                      </div>
                    )}
                  </div>
                  {/* === 分類 === */}
                  <div className="border-b border-gray-50">
                    <button onClick={() => toggleSection('category')}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" />
                        分類
                        {filterCategories.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </span>
                      {expandedFilterSections.has('category') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {expandedFilterSections.has('category') && (
                      <div className="px-3 pb-2 flex flex-wrap gap-1">
                        {CATEGORY_DISPLAY.map(cat => {
                          const selected = filterCategories.includes(cat.value);
                          return (
                            <button key={cat.value} onClick={() => setFilterCategories(prev =>
                              prev.includes(cat.value) ? prev.filter(v => v !== cat.value) : [...prev, cat.value]
                            )}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                              }`}>
                              {cat.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* === 供應商 === */}
                  <div className="border-b border-gray-50">
                    <button onClick={() => toggleSection('supplier')}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        供應商
                        {filterSupplier && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </span>
                      {expandedFilterSections.has('supplier') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {expandedFilterSections.has('supplier') && (
                      <div className="px-3 pb-2">
                        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-white">
                          <option value="">全部供應商</option>
                          {supplierOptions.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {/* === 付款狀態 === */}
                  <div>
                    <button onClick={() => toggleSection('payment')}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" />
                        付款
                        {filterPaymentStatus.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </span>
                      {expandedFilterSections.has('payment') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {expandedFilterSections.has('payment') && (
                      <div className="px-3 pb-2 flex flex-wrap gap-1">
                        {PAYMENT_OPTIONS.map(opt => {
                          const selected = filterPaymentStatus.includes(opt.value);
                          return (
                            <button key={opt.value} onClick={() => setFilterPaymentStatus(prev =>
                              prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                            )}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                              }`}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredExpenses || filteredExpenses.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground px-3">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{expenses && expenses.length > 0 ? '沒有符合篩選條件的記錄' : '暫無支出記錄'}</p>
                  <p className="text-xs mt-1">{expenses && expenses.length > 0 ? '請調整篩選條件' : '使用 AI 掃描上傳收據，或手動新增'}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* 总计 - 作为第一个full-width行 */}
                  <div className="text-xs text-muted-foreground px-1.5 py-2 flex items-center gap-2 bg-gray-50/50">
                    <span className="font-medium text-gray-700">{expenseTree.totalCount}</span> 筆記錄，總金額 <span className="font-semibold text-gray-800">${expenseTree.total.toLocaleString()}</span>
                  </div>

                  {expenseTree.groups.map(yg => {
                    const yExpanded = expandedNodes.has(yg.yearKey);
                    return (
                      <div key={yg.yearKey} className="border-b border-gray-100 last:border-b-0">
                        {/* 年份層 - 全寬無圓角 */}
                        <div className="flex items-center gap-1.5 px-1.5 py-1.5 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors w-full text-xs md:text-sm"
                             onClick={() => { const n = new Set(expandedNodes); if (n.has(yg.yearKey)) n.delete(yg.yearKey); else n.add(yg.yearKey); setExpandedNodes(n); }}>
                          {yExpanded ? <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-600 shrink-0" /> : <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-600 shrink-0" />}
                          <span className="font-semibold text-blue-800">{yg.year} 年</span>
                          <span className="text-xs text-blue-400 ml-1">{yg.yEntries.length} 筆</span>
                          <span className="ml-auto font-medium text-blue-700 text-xs md:text-sm">${yg.yTotal.toLocaleString()}</span>
                        </div>
                        {/* 月份 + 條目 - 全寬，不縮進，與年份對齊 */}
                        {yExpanded && (
                          <div className="divide-y divide-gray-50">
                            {yg.months.map(mg => {
                              const mExpanded = expandedNodes.has(mg.monthKey);
                              const mParts = mg.month.split('-');
                              const mLabel = mParts.length === 2 ? `${parseInt(mParts[1])}月` : mg.month;
                              return (
                                <div key={mg.monthKey}>
                                  {/* 月份層 - 全寬無內邊距 */}
                                  <div className="flex items-center gap-1.5 px-1.5 py-1 bg-gray-50/80 cursor-pointer hover:bg-gray-100 transition-colors w-full text-xs"
                                       onClick={() => { const n = new Set(expandedNodes); if (n.has(mg.monthKey)) n.delete(mg.monthKey); else n.add(mg.monthKey); setExpandedNodes(n); }}>
                                    {mExpanded ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
                                    <span className="font-medium text-gray-700">{mLabel}</span>
                                    <span className="text-[10px] text-gray-400 ml-1">{mg.mEntries.length} 筆</span>
                                    <span className="ml-auto text-xs text-gray-500">${mg.mTotal.toLocaleString()}</span>
                                  </div>
                                  {/* 條目列表 - 全寬無內邊距 */}
                                  {mExpanded && (
                                    <div className="w-full">
                                      {mg.mEntries.map((exp: any) => {
                                        const isEditing = editingId === exp.id;
                                        const isDetailOpen = expandedDetailId === exp.id;
                                        return (
                                          <div key={exp.id} className="border-t border-gray-50 first:border-t-0">
                                            {/* 條目行 - 全寬無內邊距 */}
                                            <div
                                              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer transition-colors w-full ${
                                                isDetailOpen ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                              }`}
                                              onClick={() => setExpandedDetailId(isDetailOpen ? null : exp.id)}
                                            >
                                              {/* 日期 */}
                                              <span className="text-[11px] text-gray-400 shrink-0 w-4 text-left">
                                                {exp.expense_date ? parseInt(exp.expense_date.slice(8)) : ''}
                                              </span>
                                              {/* 供應商簡寫 */}
                                              {exp.supplier && (
                                                <span className="inline-block px-1 py-0.5 rounded text-[10px] font-medium shrink-0 bg-green-100 text-green-700 border border-green-200" title={exp.supplier}>
                                                  {shortSupplier(exp.supplier)}
                                                </span>
                                              )}
                                              {/* 分類（不同顏色） */}
                                              {(() => {
                                                const cc = CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.other;
                                                return (
                                                  <span className={`inline-block px-1 py-0.5 rounded text-[10px] font-medium shrink-0 ${cc.bg} ${cc.text} ${cc.border} border`}>
                                                    {shortCategory(exp.category)}
                                                  </span>
                                                );
                                              })()}
                                              {/* 購貨內容 */}
                                              <span className="flex-1 min-w-0 text-gray-700 truncate text-xs">
                                                {cleanDescription(exp.description)}
                                              </span>
                                              {/* 金額 */}
                                              <span className="font-medium text-right shrink-0 w-14 text-xs">
                                                ${Number(exp.amount).toLocaleString()}
                                              </span>
                                              {/* 付款狀態 */}
                                              <span className={`inline-block px-1 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                                                exp.payment_status === 'cash' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                exp.payment_status === 'bank' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                              }`}>
                                                {exp.payment_status === 'cash' ? '現金' : exp.payment_status === 'bank' ? '銀行' : '未付'}
                                              </span>
                                            </div>
                                            {/* 詳情面板 */}
                                            {isDetailOpen && (
                                              <div className="px-2.5 py-2.5 bg-indigo-50/50 border-t border-indigo-100 text-[11px]">
                                                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                                  {/* Row 1: 詳情 (full width) */}
                                                  <div className="flex items-baseline gap-1.5 col-span-2">
                                                    <span className="text-gray-400 shrink-0">詳情：</span>
                                                    {isEditing ? (
                                                      <input value={editForm.description ?? exp.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full border rounded px-1.5 py-0.5 text-xs bg-white" />
                                                    ) : (
                                                      <span className="text-gray-700 break-words">{cleanDescription(exp.description)}</span>
                                                    )}
                                                  </div>
                                                  {/* Row 2: 供應商 / 日期 */}
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">供應商：</span>
                                                    {isEditing ? (
                                                      <input value={editForm.supplier ?? exp.supplier ?? ''} onChange={e => setEditForm({...editForm, supplier: e.target.value})} className="w-full border rounded px-1.5 py-0.5 text-xs bg-white" />
                                                    ) : (
                                                      <span className="text-gray-700 break-words">{exp.supplier || '—'}</span>
                                                    )}
                                                  </div>
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">日期：</span>
                                                    {isEditing ? (
                                                      <input type="date" value={editForm.expense_date || exp.expense_date} onChange={e => setEditForm({...editForm, expense_date: e.target.value})} className="border rounded px-1.5 py-0.5 text-xs bg-white" />
                                                    ) : (
                                                      <span className="text-gray-700">{exp.expense_date}</span>
                                                    )}
                                                  </div>
                                                  {/* Row 3: 發票號碼 / 金額 */}
                                                  {exp.invoice ? (
                                                    <div className="flex items-baseline gap-1.5">
                                                      <span className="text-gray-400 shrink-0">發票號碼：</span>
                                                      <span className="text-gray-700">{exp.invoice}</span>
                                                    </div>
                                                  ) : (
                                                    <div />
                                                  )}
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">金額：</span>
                                                    {isEditing ? (
                                                      <input type="number" value={editForm.amount ?? exp.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value) || 0})} className="w-20 border rounded px-1.5 py-0.5 text-xs text-right bg-white" />
                                                    ) : (
                                                      <span className="font-medium text-green-700">${Number(exp.amount).toLocaleString()}</span>
                                                    )}
                                                  </div>
                                                  {/* Row 4: 分類 / 付款 */}
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">分類：</span>
                                                    {isEditing ? (
                                                      <select value={editForm.category || categoryToLabel(exp.category)} onChange={e => setEditForm({...editForm, category: e.target.value})} className="border rounded px-1 py-0.5 text-xs bg-white">
                                                        {CATEGORY_DISPLAY.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
                                                      </select>
                                                    ) : (
                                                      <span className="text-gray-700">{categoryToLabel(exp.category)}</span>
                                                    )}
                                                  </div>
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">付款：</span>
                                                    {isEditing ? (
                                                      <select value={editForm.payment_status || exp.payment_status || ''} onChange={e => setEditForm({...editForm, payment_status: e.target.value})} className="border rounded px-1 py-0.5 text-xs bg-white">
                                                        <option value="cash">現金已付</option>
                                                        <option value="bank">銀行已付</option>
                                                        <option value="unpaid">未付</option>
                                                      </select>
                                                    ) : (
                                                      <span className={`font-medium ${exp.payment_status === 'cash' ? 'text-green-600' : exp.payment_status === 'bank' ? 'text-blue-600' : 'text-gray-500'}`}>
                                                        {exp.payment_status === 'cash' ? '現金已付' : exp.payment_status === 'bank' ? '銀行已付' : '未付'}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {/* Row 5: 經手人 / 記錄時間 */}
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="text-gray-400 shrink-0">經手人：</span>
                                                    <span className="text-gray-700">{exp.handler || useAuthStore.getState().user?.name || '—'}</span>
                                                  </div>
                                                  {exp.created_at ? (
                                                    <div className="flex items-baseline gap-1">
                                                      <span className="text-gray-400 shrink-0">記錄時間：</span>
                                                      <span className="text-gray-700">{new Date(exp.created_at).toLocaleString()}</span>
                                                    </div>
                                                  ) : (
                                                    <div />
                                                  )}
                                                </div>
                                                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-indigo-100">
                                                  <div>
                                                    {exp.receipt_url && (
                                                      <button onClick={() => setLightboxImage(exp.receipt_url!)} className="text-[11px] text-blue-600 hover:text-blue-800 underline flex items-center gap-1">
                                                        <Receipt className="w-3 h-3" />查看收據照片
                                                      </button>
                                                    )}
                                                  </div>
                                                  {can('expense.manage') && (
                                                  <div className="flex items-center gap-1">
                                                    {deleteConfirmId === exp.id ? (
                                                      <>
                                                        <span className="text-[11px] text-red-600">確認刪除？</span>
                                                        <Button size="sm" variant="destructive" onClick={() => handleDelete(exp.id)} className="h-5 text-[10px] px-2">刪除</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)} className="h-5 text-[10px]">取消</Button>
                                                      </>
                                                    ) : editingId === exp.id ? (
                                                      <>
                                                        <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(exp.id)} disabled={saving} className="h-5 text-[10px] px-1.5">
                                                          <Save className="w-2.5 h-2.5 mr-0.5" />儲存
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm({}); }} className="h-5 text-[10px] px-1.5">
                                                          <X className="w-2.5 h-2.5 mr-0.5" />取消
                                                        </Button>
                                                      </>
                                                    ) : (
                                                      <div className="flex items-center gap-0.5">
                                                        <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteConfirmId(exp.id)}>
                                                          <Trash2 className="w-2.5 h-2.5" />
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-5 px-1.5 text-[10px] text-indigo-600 border-indigo-200 hover:bg-indigo-100" onClick={() => { setEditingId(exp.id); setEditForm({ category: categoryToLabel(exp.category), amount: exp.amount, description: exp.description, expense_date: exp.expense_date, payment_status: exp.payment_status, supplier: exp.supplier }); setExpandedDetailId(exp.id); }}>
                                                          <Edit2 className="w-2.5 h-2.5" />修改
                                                        </Button>
                                                      </div>
                                                    )}
                                                  </div>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : activeTab === 'settlement' ? (
        <SettlementPage embedded />
      ) : activeTab === 'cash_settlement' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-green-600" />
                  現金日結
                </CardTitle>
                <Input type="date" value={cashDate} onChange={e => setCashDate(e.target.value)} className="w-fit" />
              </div>
              <CardDescription>員工日結：填寫以下 3 項資料後提交</CardDescription>
            </CardHeader>
            <CardContent>
              {cashLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* 系統計算參考 */}
                  <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                    <p><strong>系統計算收銀箱餘額</strong>：底金 $1,500 + POS 現金 ${cashRegister.pos_cash_income.toLocaleString()} − 開支 ${cashRegister.cash_expenses.toLocaleString()} = <span className="text-lg font-bold">${cashRegister.expected_balance.toLocaleString()}</span></p>
                  </div>

                  {/* 員工填寫 3 欄 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">① 收工時錢箱總共有幾錢？</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input
                          type="number"
                          value={cashRegister.actual_counted ?? ''}
                          onChange={e => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setCashRegister(prev => ({ ...prev, actual_counted: v, difference: v !== null ? v - prev.expected_balance : 0 }));
                          }}
                          placeholder="輸入點算總金額"
                          className="pl-7"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">② 錢箱留多少錢到明天用？</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input
                          type="number"
                          value={cashRegister.retained_balance}
                          onChange={e => setCashRegister(prev => ({ ...prev, retained_balance: e.target.value ? Number(e.target.value) : 0 }))}
                          className="pl-7"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">預設 $1,500，可修改</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">③ 放了多少錢入保險箱？</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input
                          type="number"
                          value={cashRegister.deposited_safe}
                          onChange={e => setCashRegister(prev => ({ ...prev, deposited_safe: e.target.value ? Number(e.target.value) : 0 }))}
                          placeholder="輸入存入金額"
                          className="pl-7"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 實時計算核對 */}
                  {cashRegister.actual_counted !== null && (
                    <>
                      <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-gray-500">錢箱應有</p>
                            <p className="text-lg font-bold text-gray-800">${cashRegister.expected_balance.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">實際點算</p>
                            <p className="text-lg font-bold text-gray-800">${(cashRegister.actual_counted || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">差異</p>
                            <p className={`text-lg font-bold ${cashRegister.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {cashRegister.difference >= 0 ? '+' : ''}${cashRegister.difference.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {Math.abs(cashRegister.difference) >= 100 && (
                          <p className="text-xs text-red-600 text-center mt-2">⚠️ 差異達 $100 或以上，將自動通知老闆</p>
                        )}
                      </div>
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-xs text-gray-500">留明日</p>
                            <p className="text-lg font-bold text-amber-700">${cashRegister.retained_balance.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">存入保險箱</p>
                            <p className="text-lg font-bold text-green-700">${cashRegister.deposited_safe.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 text-center mt-2">
                          合計：<strong>${((cashRegister.retained_balance || 0) + (cashRegister.deposited_safe || 0)).toLocaleString()}</strong>
                          {cashRegister.actual_counted !== null && Math.abs(((cashRegister.retained_balance || 0) + (cashRegister.deposited_safe || 0)) - (cashRegister.actual_counted || 0)) > 0.5 && (
                            <span className="text-red-500"> ⚠️ 與點算總額不符（差 ${Math.abs(((cashRegister.retained_balance || 0) + (cashRegister.deposited_safe || 0)) - (cashRegister.actual_counted || 0)).toLocaleString()}）</span>
                          )}
                        </p>
                      </div>
                    </>
                  )}

                  {/* 備註與提交 */}
                  <div className="border-t pt-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">備註（可選）</label>
                      <Input value={cashRegister.notes} onChange={e => setCashRegister(prev => ({ ...prev, notes: e.target.value }))} placeholder="如有差異或其他備註" />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveCashRegister} disabled={cashSaving || cashRegister.actual_counted === null || cashRegister.actual_counted === undefined}>
                        {cashSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {cashRegister.status === 'done' ? '更新日結' : '提交日結'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 現金日結報告 - 按鈕切換 */}
          <div className="flex justify-start">
            <Button variant="outline" size="sm" onClick={() => setShowCashReport(!showCashReport)} className="text-xs">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              {showCashReport ? '隱藏' : '查看'}現金日結報告
            </Button>
          </div>
          {showCashReport && (
            <CashReportSection restaurantId={user?.restaurant_id || ''} canView={can('expense.cash_report')} />
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 保險箱 */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 shrink-0 break-words whitespace-normal text-base sm:text-2xl">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>保險箱管理</span>
                </CardTitle>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <Input
                    type="month"
                    value={safeMonth}
                    onChange={e => { setSafeMonth(e.target.value); setSafeReconcileMode(false); }}
                    className="w-fit"
                  />
                  {!safeReconcileMode && (
                    <Button variant="outline" size="sm" onClick={() => setSafeReconcileMode(true)}>
                      <Calculator className="w-3.5 h-3.5 mr-1" />核對
                    </Button>
                  )}
                </div>
              </div>
              <CardDescription>每月核對保險箱實際金額與系統記錄</CardDescription>
            </CardHeader>
            <CardContent>
              {safeLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* 該月存入記錄 */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">存入記錄</h3>
                    {safeRecords.length === 0 ? (
                      <p className="text-sm text-gray-400">本月尚無存入記錄（日結後自動生成）</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">日期</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">金額</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">備註</th>
                            </tr>
                          </thead>
                          <tbody>
                            {safeRecords.map((r: any) => (
                              <tr key={r.id} className="border-b border-gray-50">
                                <td className="px-3 py-2 text-gray-700">{r.date}</td>
                                <td className="px-3 py-2 text-right font-medium text-green-700">${Number(r.amount).toLocaleString()}</td>
                                <td className="px-3 py-2 text-gray-400 text-xs">{r.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 font-medium">
                              <td className="px-3 py-2 text-gray-700">合計</td>
                              <td className="px-3 py-2 text-right text-green-800">
                                ${safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString()}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 核對區 */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">月度核對</h3>
                    {safeReconciliation && !safeReconcileMode ? (
                      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">系統預計餘額</span>
                          <span className="font-medium">${Number(safeReconciliation.expected_balance || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">實際點算</span>
                          <span className="font-medium">${Number(safeReconciliation.actual_counted || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-2 border-t">
                          <span className="text-gray-500">差異</span>
                          <span className={`font-bold ${Number(safeReconciliation.difference) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {Number(safeReconciliation.difference) >= 0 ? '+' : ''}${Number(safeReconciliation.difference).toLocaleString()}
                          </span>
                        </div>
                        {safeReconciliation.reconciled_at && (
                          <p className="text-xs text-gray-400 pt-1">
                            核對時間：{new Date(safeReconciliation.reconciled_at).toLocaleString('zh-HK')}
                          </p>
                        )}
                      </div>
                    ) : safeReconcileMode ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">系統預計餘額</label>
                          <p className="text-lg font-bold text-gray-800">
                            ${safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">實際點算金額</label>
                          <Input type="number" value={safeActual} onChange={e => setSafeActual(Number(e.target.value) || 0)} placeholder="輸入實際點算金額" />
                        </div>
                        {safeActual > 0 && (
                          <div className={`rounded-lg p-3 ${Math.abs(safeActual - safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)) > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                            <span className="text-sm font-medium">
                              差異：{safeActual - safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0) >= 0 ? '+' : ''}
                              ${(safeActual - safeRecords.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)).toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={() => setSafeReconcileMode(false)}>取消</Button>
                          <Button onClick={handleSaveSafeReconciliation} disabled={cashSaving || safeActual <= 0}>
                            {cashSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            確認核對
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400">尚未進行核對</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => setSafeReconcileMode(true)}>
                          <Calculator className="w-3.5 h-3.5 mr-1" />開始核對
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 錯誤提示 Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <p className="font-medium">{errorMessage}</p>
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setErrorMessage(null)}>關閉</Button>
          </div>
        </div>
      )}

      {/* ===== 圖片放大檢視（Lightbox）— 支援滾輪/拖曳/手勢縮放 ===== */}
      {lightboxImage && (() => {
        let z = 1, panX = 0, panY = 0, isPan = false, sx = 0, sy = 0, psx = 0, psy = 0, pinch = 0;
        const apply = () => { const el = document.getElementById('lb-img'); if (el) el.style.transform = `translate(${panX}px,${panY}px) scale(${z})`; };
        const setZ = (n: number) => { z = Math.min(5, Math.max(0.5, n)); if (z <= 1) { panX = 0; panY = 0; } apply(); };
        const reset = () => { z = 1; panX = 0; panY = 0; apply(); };

        return (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 select-none"
          style={{ cursor: isPan ? 'grabbing' : z > 1 ? 'grab' : 'zoom-out' }}
          onClick={(e) => { if (e.target === e.currentTarget) { reset(); setLightboxImage(null); } }}
          onWheel={(e: any) => { e.preventDefault(); setZ(z + (e.deltaY > 0 ? -0.15 : 0.15)); }}
          onMouseDown={(e) => { if (z > 1) { isPan = true; sx = e.clientX; sy = e.clientY; psx = panX; psy = panY; } }}
          onMouseMove={(e) => { if (isPan) { panX = psx + (e.clientX - sx); panY = psy + (e.clientY - sy); apply(); } }}
          onMouseUp={() => { isPan = false; }}
          onMouseLeave={() => { isPan = false; }}
          onDoubleClick={() => z === 1 ? setZ(2.5) : reset()}
          onTouchStart={(e: any) => {
            const t = e.nativeEvent;
            if (t.touches.length === 2) { pinch = Math.hypot(t.touches[0].clientX - t.touches[1].clientX, t.touches[0].clientY - t.touches[1].clientY); }
            if (t.touches.length === 1 && z > 1) { isPan = true; sx = t.touches[0].clientX; sy = t.touches[0].clientY; psx = panX; psy = panY; }
          }}
          onTouchMove={(e: any) => {
            const t = e.nativeEvent; e.preventDefault();
            if (t.touches.length === 2 && pinch) { const d = Math.hypot(t.touches[0].clientX - t.touches[1].clientX, t.touches[0].clientY - t.touches[1].clientY); setZ(z + (d - pinch) / 200); pinch = d; }
            if (t.touches.length === 1 && isPan) { panX = psx + (t.touches[0].clientX - sx); panY = psy + (t.touches[0].clientY - sy); apply(); }
          }}
          onTouchEnd={() => { isPan = false; pinch = 0; }}
        >
          <div className="relative flex items-center justify-center overflow-hidden" style={{ maxWidth: '95vw', maxHeight: '95vh' }}>
            <img id="lb-img" src={lightboxImage} alt="收據放大" draggable={false}
              className="rounded-lg shadow-2xl select-none"
              style={{ maxWidth: '100%', maxHeight: '95vh', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); if (z > 1) { isPan = true; sx = e.clientX; sy = e.clientY; psx = panX; psy = panY; } }}
              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; ((e.currentTarget as HTMLElement).nextElementSibling as HTMLElement)?.classList.remove('hidden'); }}
            />
            <div className="hidden text-white text-sm bg-black/60 px-4 py-2 rounded-lg">⚠️ 無法載入圖片</div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
              <button onClick={(e) => { e.stopPropagation(); setZ(z - 0.25); }} className="text-white hover:text-blue-300 text-lg leading-none w-8 h-8 flex items-center justify-center">−</button>
              <span className="text-white text-xs min-w-[42px] text-center">{Math.round(z * 100)}%</span>
              <button onClick={(e) => { e.stopPropagation(); setZ(z + 0.25); }} className="text-white hover:text-blue-300 text-lg leading-none w-8 h-8 flex items-center justify-center">+</button>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-white hover:text-blue-300 text-xs ml-1">⟲</button>
            </div>
            <button onClick={() => { reset(); setLightboxImage(null); }}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ========== 每日現金日結報告（僅老闆可看） ==========
function CashReportSection({ restaurantId, canView }: { restaurantId: string; canView: boolean }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (!canView) return;
    loadReport();
  }, [month]);

  const loadReport = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('cash_register')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`)
        .order('date', { ascending: true });

      if (data) setRecords(data);
    } catch (err) {
      console.error('載入日結報告失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                每日現金日結報告
              </CardTitle>
              <CardDescription>錢箱啟動數 + POS 現金 − 當日開支 → 應存 vs 實際存入</CardDescription>
            </div>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-fit" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm">本月尚無日結記錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-2 py-2 font-medium text-gray-500 whitespace-nowrap">日期</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">錢箱啟動數</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">POS 現金</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">現金開支</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">系統計算</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">實際點算</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">差異</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">留明日</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">實際存入</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">應存入</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">存入差異</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-500 whitespace-nowrap">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const expectedDeposit = (r.actual_counted || 0) - (r.retained_balance || 1500);
                    const depositDiff = (r.deposited_safe || 0) - expectedDeposit;
                    return (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-2 py-2 text-right font-medium">${Number(r.opening_balance).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right text-green-700">${Number(r.pos_cash_income).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right text-red-700">-${Number(r.cash_expenses).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-semibold">${Number(r.expected_balance).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">${Number(r.actual_counted).toLocaleString()}</td>
                        <td className={`px-2 py-2 text-right font-semibold ${Number(r.difference) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Number(r.difference) >= 0 ? '+' : ''}${Number(r.difference).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right">${Number(r.retained_balance || 1500).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right text-green-700 font-medium">${Number(r.deposited_safe).toLocaleString()}</td>
                        <td className={`px-2 py-2 text-right font-medium ${expectedDeposit >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                          ${expectedDeposit.toLocaleString()}
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold ${depositDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {depositDiff >= 0 ? '+' : ''}${depositDiff.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {r.status === 'done' ? '已完成' : '待處理'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
