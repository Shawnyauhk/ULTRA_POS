import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, Calendar, 
  Trash2, Sparkles, User, Edit2, Save, X, Calculator, RefreshCw, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  DollarSign, ShieldCheck, Banknote
} from 'lucide-react';
import { useExpenses } from '@/hooks/useSupabaseData';
import { useRealtimeExpenses } from '@/hooks/useRealtime';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';

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

const labelToCategory = (label: string): string =>
  CATEGORY_DISPLAY.find(c => c.label === label)?.value || 'other';

// ====== 定義前端顯示用的介面 ======
interface FormExpense {
  category: string;
  amount: number;
  description: string;
  handler: string;
  expense_date: string;
  payment_status: string;
  supplier: string;
}

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement' | 'cash_settlement' | 'safe'>('expenses');
  const { can } = usePermission();

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // 載入該日期的結算數據
  useEffect(() => {
    loadSettlement(date);
  }, [date]);

  const loadSettlement = async (d: string) => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSettlementLoading(true);
    try {
      const res = await fetch(`/api/settlements?date=${d}&restaurant_id=${rid}`);
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
      } else {
        setSettlement({...initialSettlement});
      }
    } catch (e) {
      console.error('載入結算失敗:', e);
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleSyncPOSPAL = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch('/api/settlements/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: rid, date }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncStatus(`✅ 同步完成: 總金額 $${json.data?.total_amount || 0}`);
        loadSettlement(date);
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
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<FormExpense | null>(null);
  const [ocrHandwrittenEntries, setOcrHandwrittenEntries] = useState<FormExpense[]>([]);
  const [editingEntryIndex, setEditingEntryIndex] = useState(-1);
  const [expandedEntryIndex, setExpandedEntryIndex] = useState<number | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return new Set([`year:${y}`, `month:${y}-${m}`]);
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newExpense, setNewExpense] = useState<FormExpense>({
    category: '進貨成本',
    amount: 0,
    description: '',
    handler: '',
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
      description: newExpense.handler
        ? `${newExpense.description} (經手人: ${newExpense.handler})`
        : newExpense.description,
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
    if (editForm.description !== undefined) {
      updates.description = editForm.handler
        ? `${editForm.description} (經手人: ${editForm.handler})`
        : editForm.description;
    }
    if (editForm.expense_date) updates.expense_date = editForm.expense_date;
    if (editForm.payment_status) updates.payment_status = editForm.payment_status;
    if (editForm.supplier !== undefined) updates.supplier = editForm.supplier;
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

  /** 壓縮圖片：縮小到 maxDimension 以下，減少 base64 體積，避免 API 超時 */
  const compressImage = (dataUrl: string, maxDimension = 1600, quality = 0.75): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * maxDimension / width);
            width = maxDimension;
          } else {
            width = Math.round(width * maxDimension / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 不支援')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('圖片加載失敗'));
      img.src = dataUrl;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
    setExpandedEntryIndex(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setErrorMessage('檔案讀取失敗，請重新上傳');
      setOcrPreview(null);
    };
    reader.onload = async (event) => {
      const imageData = event.target?.result as string;
      setOcrPreview(imageData);
      try {
        console.log(`[OCR] 開始壓縮圖片 (原始: ${(imageData.length/1024).toFixed(0)}KB)...`);
        // 壓縮圖片再發送
        const compressed = await compressImage(imageData, 1600, 0.75);
        console.log(`[OCR] 壓縮完成: ${(compressed.length/1024).toFixed(0)}KB, 模式: ${ocrMode}`);

        // 增加 fetch 逾時控制（120秒）
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        console.log(`[OCR] 調用 API (${ocrMode} 模式)...`);
        const response = await fetch('/api/ocr/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: compressed, mode: ocrMode }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`OCR API 錯誤: ${response.status} - ${errText.slice(0, 100)}`);
        }

        const json = await response.json();
        if (!json.success) throw new Error(json.message || '識別失敗');

        const text = json.data.text;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (ocrMode === 'handwritten') {
          // === 手寫記賬本模式：解析多筆支出，支援日/月 與 YYYY-MM-DD 格式 ===
          const entries: FormExpense[] = [];
          let currentDate = '';
          const thisYear = new Date().getFullYear(); // 2026
          let detectedMonth = -1; // 從第一個有月份的日期檢測

          for (const line of lines) {
            // 跳過總計行
            if (/^總支出|^總價|^總金額/.test(line)) continue;

            // 嘗試匹配完整日期：日期: 2026-04-08, 項目: XXX, 支出: $Y
            let m = line.match(/^日期[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})[,\s]*項目[：:]\s*(.*?)[,\s]*支出[：:]\s*\$?\s*([\d,]+\.?\d*)/);
            if (m) {
              const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
              currentDate = `${y}-${mo}-${d}`;
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
              currentDate = `${thisYear}-${month}-${day}`;
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
              currentDate = `${thisYear}-${month}-${day}`;
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
              currentDate = `${thisYear}-${month}-${day}`;
              continue;
            }

            // 嘗試匹配日期行（YYYY-MM-DD 格式）
            m = line.match(/^日期[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (m) {
              const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
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
            const fallbackDate = `${thisYear}-${String(detectedMonth).padStart(2, '0')}-01`;
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

          for (const line of lines) {
            const sm = line.match(/^供應商[：:]\s*(.+)/);
            if (sm) { supplier = sm[1].trim(); continue; }
            const dm = line.match(/^日期[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
            if (dm) { expense_date = dm[1].replace(/\//g, '-'); continue; }
            const tm = line.match(/^總價\s*\$?\s*([\d,]+\.?\d*)/);
            if (tm) { amount = parseFloat(tm[1].replace(/,/g, '')); continue; }
            if (line.includes('$') || /^\d/.test(line)) continue;
            if (!/^供應商|^日期|^總價|^發票/.test(line) && line.length > 1) {
              description += (description ? ', ' : '') + line;
            }
          }

          setOcrResult({
            amount,
            expense_date,
            category: '進貨成本',
            description: description || text.slice(0, 200),
            handler: 'AI',
            payment_status: '',
            supplier,
          });
        }
      } catch (err: any) {
        console.error('OCR 識別失敗:', err);
        if (err.name === 'AbortError') {
          setErrorMessage('OCR 請求逾時（超過120秒），請嘗試上傳較小的圖片');
        } else {
          setErrorMessage('OCR 識別失敗: ' + (err.message || '請確認後端服務是否運行'));
        }
        setOcrPreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOCRConfirm = async () => {
    if (!ocrResult) return;
    if (!ocrResult.payment_status) {
      setErrorMessage('請選擇付款狀態（現金已付 / 銀行已付 / 未付）');
      return;
    }
    setSaving(true);
    const expenseData = {
      category: labelToCategory(ocrResult.category),
      amount: ocrResult.amount,
      description: ocrResult.description,
      expense_date: ocrResult.expense_date,
      payment_status: ocrResult.payment_status,
      supplier: ocrResult.supplier || '',
    };
    const result = await createExpense(expenseData);
    if (!result.success) setErrorMessage('OCR 保存失敗：' + (result as any).error);
    setSaving(false);
    setShowOCR(false);
    setOcrPreview(null);
    setOcrResult(null);
    setOcrHandwrittenEntries([]);
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
    let failed = 0;
    for (const entry of ocrHandwrittenEntries) {
      const result = await createExpense({
        category: labelToCategory(entry.category),
        amount: entry.amount,
        description: entry.description,
        expense_date: entry.expense_date,
        payment_status: entry.payment_status,
        supplier: entry.supplier || '',
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
    deposited_safe: 0,
    difference: 0,
    status: 'pending',
    notes: '',
  });
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashNotified, setCashNotified] = useState(false);

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
          deposited_safe: Number(existing.deposited_safe) || deposited,
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
          deposited_safe: deposited,
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
      const diff = actual - cashRegister.expected_balance;
      const deposited = cashRegister.expected_balance > 1500 ? cashRegister.expected_balance - 1500 : 0;

      const payload = {
        restaurant_id: rid,
        date: cashDate,
        opening_balance: 1500,
        pos_cash_income: cashRegister.pos_cash_income,
        cash_expenses: cashRegister.cash_expenses,
        expected_balance: cashRegister.expected_balance,
        actual_counted: actual,
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

  // === 預計算支出樹形結構（年→月→日）===
  const expenseTree = useMemo(() => {
    if (!expenses || expenses.length === 0) return { groups: [], total: 0, totalCount: 0 };
    const sorted = [...expenses].sort((a: any, b: any) =>
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">門店收支</h1>
          <p className="text-sm text-muted-foreground">支出記錄、每日結算、現金日結與保險箱管理</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start md:self-auto flex-wrap">
          <Button variant={activeTab === 'expenses' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('expenses')}>門店支出</Button>
          <Button variant={activeTab === 'settlement' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('settlement')}>每日結算</Button>
          {can('expense.manage') && (
            <Button variant={activeTab === 'cash_settlement' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('cash_settlement')}>
              <DollarSign className="w-3.5 h-3.5 mr-1" />現金日結
            </Button>
          )}
          {can('safe.view') && (
            <Button variant={activeTab === 'safe' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('safe')}>
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />保險箱
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
                {!ocrPreview ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p>{ocrMode === 'receipt' ? '點擊上傳收據照片' : '點擊上傳手寫記賬本照片'}</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <img src={ocrPreview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
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
                            const sortedDates = Array.from(dateMap.keys()).sort();
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
                        // === 收據模式：單筆支出 ===
                        <>
                          <p className="font-medium">解析結果：</p>
                          <p>金額：${ocrResult.amount}</p>
                          <p>分類：{ocrResult.category}</p>
                          <p>供應商：{ocrResult.supplier || '—'}</p>
                          <p>描述：{ocrResult.description}</p>
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
                          <div className="flex gap-2">
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
                    <Input value={newExpense.handler || ''}
                      onChange={e => setNewExpense({...newExpense, handler: e.target.value})} />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">支出記錄</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !expenses || expenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>暫無支出記錄</p>
                  <p className="text-sm mt-1">使用 AI 掃描上傳收據，或手動新增</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 总计 */}
                  <div className="text-sm text-muted-foreground px-1 pb-2 border-b">
                    {expenseTree.totalCount} 筆記錄，總金額 <span className="font-semibold text-gray-700">${expenseTree.total.toLocaleString()}</span>
                  </div>

                  {expenseTree.groups.map(yg => {
                    const yExpanded = expandedNodes.has(yg.yearKey);
                    return (
                      <div key={yg.yearKey}>
                        {/* 年份層 */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                             onClick={() => { const n = new Set(expandedNodes); if (n.has(yg.yearKey)) n.delete(yg.yearKey); else n.add(yg.yearKey); setExpandedNodes(n); }}>
                          {yExpanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-blue-600" />}
                          <span className="font-semibold text-blue-800">{yg.year} 年</span>
                          <Badge variant="secondary" className="ml-1 text-xs">{yg.yEntries.length} 筆</Badge>
                          <span className="ml-auto font-medium text-blue-700">${yg.yTotal.toLocaleString()}</span>
                        </div>

                        {yExpanded && (
                          <div className="ml-4 mt-1 space-y-1">
                            {yg.months.map(mg => {
                              const mExpanded = expandedNodes.has(mg.monthKey);
                              const mParts = mg.month.split('-');
                              const mLabel = mParts.length === 2 ? `${parseInt(mParts[1])}月` : mg.month;
                              return (
                                <div key={mg.monthKey}>
                                  {/* 月份層 */}
                                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                                       onClick={() => { const n = new Set(expandedNodes); if (n.has(mg.monthKey)) n.delete(mg.monthKey); else n.add(mg.monthKey); setExpandedNodes(n); }}>
                                    {mExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                                    <span className="font-medium text-gray-700">{mLabel}</span>
                                    <Badge variant="outline" className="text-xs">{mg.mEntries.length} 筆</Badge>
                                    <span className="ml-auto text-sm text-gray-600">${mg.mTotal.toLocaleString()}</span>
                                  </div>

                                  {mExpanded && (
                                    <div className="ml-4 mt-1 space-y-1">
                                      {mg.days.map(dg => {
                                        const dParts = dg.day.split('-');
                                        const dLabel = dParts.length === 3 ? `${parseInt(dParts[1])}/${parseInt(dParts[2])}` : dg.day;
                                        return (
                                          <div key={dg.day} className="border rounded-lg overflow-hidden">
                                            {/* 日期層標題 */}
                                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border-b text-sm">
                                              <Calendar className="w-3 h-3 text-gray-400" />
                                              <span className="text-gray-600">{dLabel}</span>
                                              <span className="text-xs text-gray-400">({dg.entries.length} 筆)</span>
                                              <span className="ml-auto text-xs text-gray-500">小計：${dg.dTotal.toLocaleString()}</span>
                                            </div>
                                            {/* 條目層 */}
                                            <div className="divide-y">
                                              {dg.entries.map((exp: any) => {
                                                const isEditing = editingId === exp.id;
                                                return (
                                                  <div key={exp.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                                                    <div className="w-20 shrink-0">
                                                      {isEditing
                                                        ? <Select value={editForm.category || categoryToLabel(exp.category)} onValueChange={v => setEditForm({...editForm, category: v})}
                                                            options={CATEGORY_DISPLAY.map(c => ({ value: c.label, label: c.label }))} />
                                                        : <Badge variant="outline" className="text-xs whitespace-nowrap">{categoryToLabel(exp.category)}</Badge>}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                      {isEditing
                                                        ? <Input value={editForm.description ?? exp.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="h-7 text-xs" />
                                                        : <span className="truncate block" title={exp.description}>{exp.description || '—'}</span>}
                                                    </div>
                                                    <div className="w-24 shrink-0 text-center">
                                                      {isEditing
                                                        ? <Input value={(editForm.supplier ?? exp.supplier) || ''} onChange={e => setEditForm({...editForm, supplier: e.target.value})} className="h-7 text-xs" />
                                                        : <span className="text-xs text-gray-500">{exp.supplier || '—'}</span>}
                                                    </div>
                                                    <div className="w-24 text-right font-medium shrink-0">
                                                      {isEditing
                                                        ? <Input type="number" value={editForm.amount ?? exp.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value) || 0})} className="h-7 text-xs text-right" />
                                                        : <span>${Number(exp.amount).toLocaleString()}</span>}
                                                    </div>
                                                    <div className="w-20 text-center shrink-0">
                                                      {isEditing ? (
                                                        <select value={editForm.payment_status || exp.payment_status || ''} onChange={e => setEditForm({...editForm, payment_status: e.target.value})} className="border rounded px-1 py-0.5 text-xs">
                                                          <option value="cash">現金</option><option value="bank">銀行</option><option value="unpaid">未付</option>
                                                        </select>
                                                      ) : (
                                                        <Badge variant={exp.payment_status === 'cash' ? 'success' : exp.payment_status === 'bank' ? 'default' : 'secondary'} className="text-xs">
                                                          {exp.payment_status === 'cash' ? '現金' : exp.payment_status === 'bank' ? '銀行' : '未付'}
                                                        </Badge>
                                                      )}
                                                    </div>
                                                    {can('expense.manage') && (
                                                      <div className="flex gap-1 shrink-0">
                                                        {deleteConfirmId === exp.id ? (
                                                          <><Button size="sm" variant="destructive" onClick={() => handleDelete(exp.id)} className="h-7 text-xs">刪除</Button>
                                                          <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)} className="h-7 text-xs">取消</Button></>
                                                        ) : isEditing ? (
                                                          <><Button size="sm" variant="ghost" onClick={() => handleSaveEdit(exp.id)} disabled={saving} className="h-7 p-1"><Save className="w-3 h-3" /></Button>
                                                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm({}); }} className="h-7 p-1"><X className="w-3 h-3" /></Button></>
                                                        ) : (
                                                          <><Button size="sm" variant="ghost" className="h-7 p-1" onClick={() => { setEditingId(exp.id); setEditForm({ category: categoryToLabel(exp.category), amount: exp.amount, description: exp.description, expense_date: exp.expense_date, payment_status: exp.payment_status, supplier: exp.supplier }); }}><Edit2 className="w-3 h-3" /></Button>
                                                          <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(exp.id)} className="h-7 p-1"><Trash2 className="w-3 h-3 text-red-500" /></Button></>
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
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
        <div className="space-y-6">
          {/* 每日結算 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>每日營業額結算</CardTitle>
                  <CardDescription>填寫或檢視每日各支付管道營業額</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDate(new Date().toISOString().split('T')[0])}>
                    <RefreshCw className="w-3 h-3 mr-1" /> 今天
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSyncPOSPAL} disabled={syncing}>
                    {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    同步 POSPAL
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-muted-foreground">日期</span>
                <Input type="date" value={date} onChange={e => { setDate(e.target.value); setSettlementResult(null); }} className="w-fit" />
              </div>

              {syncStatus && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  {syncStatus}
                </div>
              )}

              {settlementLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">現金</label>
                      <Input type="number" placeholder="0" value={settlement.cash}
                        onChange={e => setSettlement({...settlement, cash: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">八達通</label>
                      <Input type="number" placeholder="0" value={settlement.octopus}
                        onChange={e => setSettlement({...settlement, octopus: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Foodpanda</label>
                      <Input type="number" placeholder="0" value={settlement.foodpanda}
                        onChange={e => setSettlement({...settlement, foodpanda: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Alipay HK</label>
                      <Input type="number" placeholder="0" value={settlement.alipay_hk}
                        onChange={e => setSettlement({...settlement, alipay_hk: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">WeChat Pay HK</label>
                      <Input type="number" placeholder="0" value={settlement.wechat_hk}
                        onChange={e => setSettlement({...settlement, wechat_hk: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">美團/Keeta</label>
                      <Input type="number" placeholder="0" value={settlement.meituan_keeta}
                        onChange={e => setSettlement({...settlement, meituan_keeta: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">OpenRice</label>
                      <Input type="number" placeholder="0" value={settlement.openrice}
                        onChange={e => setSettlement({...settlement, openrice: e.target.value})} />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-xs font-medium text-muted-foreground">總交易數</label>
                      <Input type="number" placeholder="0" value={settlement.total_transactions}
                        onChange={e => setSettlement({...settlement, total_transactions: e.target.value})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-4 border-t">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">系統預估總額</label>
                      <Input type="number" placeholder="0" value={settlement.total_amount}
                        onChange={e => setSettlement({...settlement, total_amount: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">實際總額</label>
                      <Input type="number" placeholder="0" value={settlement.actual_revenue}
                        onChange={e => setSettlement({...settlement, actual_revenue: e.target.value})} />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={async () => {
                        const user = useAuthStore.getState().user;
                        const rid = user?.restaurant_id;
                        if (!rid) return;
                        setSettlementSaving(true);
                        setSettlementResult(null);
                        try {
                          const res = await fetch('/api/settlements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              restaurant_id: rid,
                              settlement_date: date,
                              ...Object.fromEntries(
                                Object.entries(settlement).map(([k, v]) => [k, v ? parseFloat(v) : 0])
                              ),
                            }),
                          });
                          const json = await res.json();
                          if (json.success) {
                            setSettlementResult('✅ 結算資料已儲存');
                          } else {
                            setSettlementResult('❌ 儲存失敗: ' + json.message);
                          }
                        } catch (e: any) {
                          setSettlementResult('❌ 錯誤: ' + e.message);
                        } finally {
                          setSettlementSaving(false);
                        }
                      }} disabled={settlementSaving}>
                        {settlementSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        儲存結算
                      </Button>
                    </div>
                  </div>

                  {settlementResult && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      {settlementResult}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
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
              <CardDescription>底金 $1,500 + POS 現金收入 − 現金開支 = 系統計算餘額</CardDescription>
            </CardHeader>
            <CardContent>
              {cashLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* 系統計算區 */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">收銀箱底金</p>
                      <p className="text-2xl font-bold text-blue-800">$1,500</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600 font-medium mb-1">POS 現金收入</p>
                      <p className="text-2xl font-bold text-green-700">${cashRegister.pos_cash_income.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-red-600 font-medium mb-1">現金開支</p>
                      <p className="text-2xl font-bold text-red-700">-${cashRegister.cash_expenses.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-indigo-600 font-medium mb-1">系統計算收銀箱餘額</p>
                    <p className="text-3xl font-bold text-indigo-800">${cashRegister.expected_balance.toLocaleString()}</p>
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <h3 className="text-sm font-medium text-gray-700">店長點算</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500">實際點算金額</label>
                        <Input
                          type="number"
                          value={cashRegister.actual_counted ?? ''}
                          onChange={e => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setCashRegister(prev => ({
                              ...prev,
                              actual_counted: v,
                              deposited_safe: v !== null && v > 1500 ? v - 1500 : 0,
                              difference: v !== null ? v - prev.expected_balance : 0,
                            }));
                          }}
                          placeholder="輸入點算金額"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">存入保險箱（餘額−底金）</label>
                        <Input type="number" value={cashRegister.deposited_safe} disabled className="bg-gray-50" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">備註</label>
                      <Input value={cashRegister.notes} onChange={e => setCashRegister(prev => ({ ...prev, notes: e.target.value }))} placeholder="如有差異或其他備註" />
                    </div>

                    {cashRegister.actual_counted !== null && (
                      <div className={`rounded-xl p-4 ${Math.abs(cashRegister.difference) >= 100 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{Math.abs(cashRegister.difference) >= 100 ? '⚠️ 差異較大' : '✅ 差異正常'}</span>
                          <span className={`text-xl font-bold ${cashRegister.difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {cashRegister.difference >= 0 ? '+' : ''}${cashRegister.difference.toLocaleString()}
                          </span>
                        </div>
                        {Math.abs(cashRegister.difference) >= 100 && (
                          <p className="text-xs text-red-600 mt-1">差異達 $100 或以上，系統將自動通知老闆</p>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveCashRegister} disabled={cashSaving || cashRegister.actual_counted === null || cashRegister.actual_counted === undefined}>
                        {cashSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {cashRegister.status === 'done' ? '更新日結' : '完成日結'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 保險箱 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                  保險箱管理
                </CardTitle>
                <div className="flex items-center gap-2">
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
    </div>
  );
}
