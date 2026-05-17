import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, Calendar, 
  Trash2, Sparkles, User, Edit2, Save, X, Calculator, RefreshCw, Loader2, CheckCircle2, AlertCircle
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
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement'>('expenses');
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

  // 提交結算到資料庫
  const handleSubmitSettlement = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) { setErrorMessage('請先登入'); return; }
    setSettlementSaving(true);
    setSettlementResult(null);
    try {
      const payload: Record<string, any> = { restaurant_id: rid, settlement_date: date, source: 'manual' };
      for (const [key, val] of Object.entries(settlement)) {
        if (val !== '') payload[key] = parseFloat(val) || 0;
      }
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSettlementResult('✅ 結算資料已成功儲存');
      } else {
        setSettlementResult(`❌ 儲存失敗: ${json.message}`);
      }
    } catch (e: any) {
      setSettlementResult(`❌ 錯誤: ${e.message}`);
    } finally {
      setSettlementSaving(false);
    }
  };

  // POSPAL 同步
  const handlePospalSync = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) { setErrorMessage('請先登入'); return; }
    setSyncing(true);
    setSyncStatus('⏳ 正在同步 POSPAL 數據，請稍候...');
    try {
      const res = await apiFetch('/api/settlements/sync', {
        method: 'POST',
        body: JSON.stringify({ restaurant_id: rid, date }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncStatus('✅ POSPAL 同步完成！');
        await loadSettlement(date);
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
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<FormExpense | null>(null);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageData = event.target?.result as string;
      setOcrPreview(imageData);
      // 使用 NVIDIA NIM OCR 識別收據
      try {
        const response = await fetch('/api/nvidia/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_NVIDIA_NIM_API_KEY}`,
          },
          body: JSON.stringify({
            model: import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: imageData }
                  },
                  {
                    type: 'text',
                    text: `你是一個收據識別助手。請分析這張收據圖片，提取以下資訊：
1. 總金額 (amount)
2. 日期 (date，格式 YYYY-MM-DD)
3. 分類 (category，只能是以下之一：進貨成本、租金、水電瓦斯、薪資、設備雜支、其他)
4. 項目描述 (description)
5. 供應商/店鋪名稱 (supplier，如收據上有店名則提取，否則設為空字串)

請以 JSON 格式回覆，格式如下：
{"amount": 數字, "date": "日期字串", "category": "分類", "description": "描述", "supplier": "供應商名稱"}

只回覆 JSON，不要有其他文字。`
                  }
                ]
              }
            ],
            max_tokens: 512,
            temperature: 0.1
          })
        });

        if (!response.ok) throw new Error(`OCR API 錯誤: ${response.status}`);

        const data = await response.json();
        const text = data.choices?.[0]?.message?.reasoning_content ||
                     data.choices?.[0]?.message?.content || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const cat = CATEGORY_DISPLAY.find(c => c.label === parsed.category) 
            ? parsed.category 
            : '其他';
          setOcrResult({
            amount: parsed.amount || 0,
            expense_date: parsed.date || new Date().toISOString().split('T')[0],
            category: cat,
            description: parsed.description || '',
            handler: 'AI',
            payment_status: '',
            supplier: parsed.supplier || '',
          });
        }
      } catch (err) {
        console.error('OCR 識別失敗:', err);
        setErrorMessage('OCR 識別失敗，請確認 NVIDIA NIM API Key 是否正確');
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
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">財務、支出與結算</h1>
          <p className="text-muted-foreground">管理店鋪日常支出與每日營業額結算</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <Button variant={activeTab === 'expenses' ? 'default' : 'ghost'} onClick={() => setActiveTab('expenses')}>門店支出</Button>
          <Button variant={activeTab === 'settlement' ? 'default' : 'ghost'} onClick={() => setActiveTab('settlement')}>每日結算</Button>
        </div>
      </div>

      {activeTab === 'expenses' ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowOCR(!showOCR)}><Sparkles className="w-4 h-4 mr-2" /> AI 掃描收據</Button>
            {can('expense.manage') && (
              <Button onClick={() => setShowAddForm(true)}><Receipt className="w-4 h-4 mr-2" /> 手動記帳</Button>
            )}
          </div>

          {showOCR && (
            <Card>
              <CardHeader><CardTitle>NVIDIA AI 智能識別收據</CardTitle></CardHeader>
              <CardContent>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                {!ocrPreview ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p>點擊上傳收據照片交由 NVIDIA AI 分析</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <img src={ocrPreview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
                    <div className="space-y-4">
                      {ocrResult ? (
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
                          <Button onClick={handleOCRConfirm} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            確認添加到資料庫
                          </Button>
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
                    <label>付款狀態</label>
                    <select
                      value={newExpense.payment_status}
                      onChange={e => setNewExpense({...newExpense, payment_status: e.target.value})}
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
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    確認
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>支出記錄</CardTitle>
              <Button variant="ghost" size="sm" onClick={refetch}>
                <RefreshCw className="w-4 h-4 mr-1" /> 刷新
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <span className="ml-2">載入中...</span>
                </div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>暫無支出記錄，請點擊上方按鈕新增</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th className="px-4 py-3">日期</th>
                        <th className="px-4 py-3">類別</th>
                        <th className="px-4 py-3">供應商</th>
                        <th className="px-4 py-3">項目描述</th>
                        <th className="px-4 py-3">金額</th>
                        <th className="px-4 py-3">經手人</th>
                        <th className="px-4 py-3">付款狀態</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(expense => {
                        const handlerMatch = expense.description?.match(/\(經手人: (.+?)\)/);
                        const displayHandler = handlerMatch ? handlerMatch[1] : '—';
                        const displayDescription = expense.description?.replace(/\s*\(經手人: .+?\)\s*$/, '') || '';
                        return (
                          <tr key={expense.id} className="border-b hover:bg-gray-50">
                            {editingId === expense.id ? (
                              <>
                                <td className="px-4 py-2">
                                  <Input type="date" value={editForm.expense_date || expense.expense_date}
                                    onChange={e => setEditForm({...editForm, expense_date: e.target.value})} />
                                </td>
                                <td className="px-4 py-2">
                                  <Select value={editForm.category || categoryToLabel(expense.category)}
                                    onValueChange={v => setEditForm({...editForm, category: v})}
                                    options={CATEGORY_DISPLAY.map(c => ({value: c.label, label: c.label}))} />
                                </td>
                                <td className="px-4 py-2">
                                  <Input value={editForm.supplier ?? (expense.supplier || '')}
                                    onChange={e => setEditForm({...editForm, supplier: e.target.value})}
                                    placeholder="供應商" />
                                </td>
                                <td className="px-4 py-2">
                                  <Input value={editForm.description ?? displayDescription}
                                    onChange={e => setEditForm({...editForm, description: e.target.value})} />
                                </td>
                                <td className="px-4 py-2">
                                  <Input type="number" value={editForm.amount ?? expense.amount}
                                    onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} />
                                </td>
                                <td className="px-4 py-2">
                                  <Input value={editForm.handler ?? displayHandler}
                                    onChange={e => setEditForm({...editForm, handler: e.target.value})} />
                                </td>
                                <td className="px-4 py-2">
                                  <select
                                    value={editForm.payment_status ?? (expense.payment_status || 'unpaid')}
                                    onChange={e => setEditForm({...editForm, payment_status: e.target.value})}
                                    className="border rounded px-2 py-1 text-sm w-full"
                                  >
                                    <option value="">-- 請選擇 --</option>
                                    <option value="cash">現金已付</option>
                                    <option value="bank">銀行已付</option>
                                    <option value="unpaid">未付</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2 flex gap-2">
                                  <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(expense.id)} disabled={saving}>
                                    <Save className="w-4 h-4 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                                    <X className="w-4 h-4 text-gray-500" />
                                  </Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3">{expense.expense_date}</td>
                                <td className="px-4 py-3"><Badge variant="secondary">{categoryToLabel(expense.category)}</Badge></td>
                                <td className="px-4 py-3">{expense.supplier || '—'}</td>
                                <td className="px-4 py-3">{displayDescription}</td>
                                <td className="px-4 py-3 font-medium">${expense.amount}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3" />{displayHandler}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {expense.payment_status === 'cash' && <Badge className="bg-green-100 text-green-800">現金已付</Badge>}
                                  {expense.payment_status === 'bank' && <Badge className="bg-blue-100 text-blue-800">銀行已付</Badge>}
                                  {(!expense.payment_status || expense.payment_status === 'unpaid') && <Badge variant="destructive">未付</Badge>}
                                </td>
                                <td className="px-4 py-3 flex gap-2">
                                  {can('expense.manage') && (
                                    <>
                                      <Button size="icon" variant="ghost"
                                        onClick={() => {
                                          setEditingId(expense.id);
                                          setEditForm({
                                            expense_date: expense.expense_date,
                                            category: categoryToLabel(expense.category),
                                            description: displayDescription,
                                            amount: expense.amount,
                                            handler: displayHandler,
                                            payment_status: expense.payment_status || 'unpaid',
                                            supplier: expense.supplier || '',
                                          });
                                        }}>
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(expense.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </td>
                              </>
                            )}
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
      ) : (
        <div className="animate-in fade-in space-y-6">
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5"/> 每日營業額結算</CardTitle>
              <CardDescription>記錄各項收款來源，或與 POSPAL 系統同步（來源：门店销售汇总）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 操作按鈕 */}
              <div className="flex gap-2 justify-end mb-4">
                <Button variant="outline" onClick={handlePospalSync} disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  POSPAL 同步
                </Button>
              </div>

              {/* 同步狀態 */}
              {syncStatus && (
                <div className={`p-3 rounded-lg text-sm ${syncStatus.startsWith('✅') ? 'bg-green-50 text-green-700' : syncStatus.startsWith('⏳') ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  {syncStatus}
                </div>
              )}

              {/* 日期選擇 */}
              <div>
                <label className="block text-sm font-medium mb-1">日期選擇</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full md:w-1/3" />
              </div>

              {/* 載入中 */}
              {settlementLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2">載入結算數據...</span>
                </div>
              ) : (
                <>
                  {/* 支付方式輸入 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[
                      { key: 'cash', label: '現金支付', icon: '💰' },
                      { key: 'octopus', label: '八達通', icon: '💳' },
                      { key: 'foodpanda', label: 'Foodpanda', icon: '🛵' },
                      { key: 'alipay_hk', label: '支付寶香港', icon: '📱' },
                      { key: 'wechat_hk', label: 'WeChat 香港', icon: '💬' },
                      { key: 'meituan_keeta', label: '美團 KEETA', icon: '🛵' },
                      { key: 'openrice', label: 'Openrice', icon: '🍽️' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium mb-1 text-gray-600">
                          {field.icon} {field.label}
                        </label>
                        <Input
                          type="number" step="0.01" placeholder="0.00"
                          value={settlement[field.key] || ''}
                          onChange={e => setSettlement({...settlement, [field.key]: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  {/* 分隔線 */}
                  <div className="border-t pt-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-blue-700">📊 總金額</label>
                        <Input type="number" step="0.01" placeholder="0.00" value={settlement.total_amount || ''}
                          onChange={e => setSettlement({...settlement, total_amount: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-green-700">📊 營業實收</label>
                        <Input type="number" step="0.01" placeholder="0.00" value={settlement.actual_revenue || ''}
                          onChange={e => setSettlement({...settlement, actual_revenue: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-purple-700">📊 總筆數</label>
                        <Input type="number" step="1" placeholder="0" value={settlement.total_transactions || ''}
                          onChange={e => setSettlement({...settlement, total_transactions: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 提交結果 */}
              {settlementResult && (
                <div className={`p-3 rounded-lg text-sm ${settlementResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {settlementResult}
                </div>
              )}

              {/* 提交按鈕 */}
              <div className="pt-2 flex justify-end">
                <Button onClick={handleSubmitSettlement} disabled={settlementSaving || settlementLoading} className="w-full md:w-auto">
                  {settlementSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  提交結算
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Message Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader><CardTitle>錯誤</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4 whitespace-pre-wrap text-sm">{errorMessage}</p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setErrorMessage(null)}>關閉</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader><CardTitle>確認刪除</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">確定要刪除此筆支出記錄？此操作無法復原。</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>取消</Button>
                <Button variant="destructive" onClick={() => handleDelete(deleteConfirmId)}>確認刪除</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
