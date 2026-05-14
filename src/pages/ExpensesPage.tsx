import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, Calendar, 
  Trash2, Sparkles, User, Edit2, Save, X, Calculator, RefreshCw, Loader2
} from 'lucide-react';
import { useExpenses } from '@/hooks/useSupabaseData';
import { useRealtimeExpenses } from '@/hooks/useRealtime';

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
}

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement'>('expenses');

  // Supabase Hook
  const { expenses, loading, refetch, createExpense, updateExpense, deleteExpense } = useExpenses();
  
  // 即時同步：當其他裝置修改開支時自動刷新
  useRealtimeExpenses(refetch);

  // UI State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<any>>({});
  const [saving, setSaving] = useState(false);

  // Settlement State
  const [revenue, setRevenue] = useState({ cash: '', octopus: '', alipay_wechat: '', delivery: '' });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

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
  });

  const handleAddExpense = async () => {
    setSaving(true);
    const expenseData = {
      category: labelToCategory(newExpense.category),
      amount: newExpense.amount,
      description: newExpense.handler
        ? `${newExpense.description} (經手人: ${newExpense.handler})`
        : newExpense.description,
      expense_date: newExpense.expense_date,
    };
    const success = await createExpense(expenseData);
    if (!success) alert('新增支出失敗');
    setSaving(false);
    setShowAddForm(false);
    setNewExpense({
      category: '進貨成本', amount: 0, description: '', handler: '',
      expense_date: new Date().toISOString().split('T')[0],
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
    const success = await updateExpense(id, updates);
    if (!success) alert('更新支出失敗');
    setSaving(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此筆支出？')) return;
    const success = await deleteExpense(id);
    if (!success) alert('刪除支出失敗');
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
                    text: `你是一個收據識別助手。請分析這張收據圖片，提取以下信息：
1. 總金額 (amount)
2. 日期 (date，格式 YYYY-MM-DD)
3. 分類 (category，只能是以下之一：進貨成本、租金、水電瓦斯、薪資、設備雜支、其他)
4. 項目描述 (description)

請以 JSON 格式回覆，格式如下：
{"amount": 數字, "date": "日期字串", "category": "分類", "description": "描述"}

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
          });
        }
      } catch (err) {
        console.error('OCR 識別失敗:', err);
        alert('OCR 識別失敗，請確認 NVIDIA NIM API Key 是否正確');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOCRConfirm = async () => {
    if (!ocrResult) return;
    setSaving(true);
    const expenseData = {
      category: labelToCategory(ocrResult.category),
      amount: ocrResult.amount,
      description: ocrResult.handler
        ? `${ocrResult.description} (經手人: ${ocrResult.handler})`
        : ocrResult.description,
      expense_date: ocrResult.expense_date,
    };
    const success = await createExpense(expenseData);
    if (!success) alert('OCR 保存失敗');
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
            <Button variant="outline" onClick={() => setShowOCR(!showOCR)}><Sparkles className="w-4 h-4 mr-2" /> NVIDIA AI 掃描收據</Button>
            <Button onClick={() => setShowAddForm(true)}><Receipt className="w-4 h-4 mr-2" /> 手動記帳</Button>
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
                          <p>描述：{ocrResult.description}</p>
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
                <div className="grid md:grid-cols-3 gap-4">
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
                    <label>描述</label>
                    <Input value={newExpense.description || ''}
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
                  </div>
                  <div>
                    <label>經手人</label>
                    <Input value={newExpense.handler || ''}
                      onChange={e => setNewExpense({...newExpense, handler: e.target.value})} />
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
                        <th className="px-4 py-3">項目描述</th>
                        <th className="px-4 py-3">金額</th>
                        <th className="px-4 py-3">經手人</th>
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
                                <td className="px-4 py-3">{displayDescription}</td>
                                <td className="px-4 py-3 font-medium">${expense.amount}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3" />{displayHandler}
                                  </div>
                                </td>
                                <td className="px-4 py-3 flex gap-2">
                                  <Button size="icon" variant="ghost"
                                    onClick={() => {
                                      setEditingId(expense.id);
                                      setEditForm({
                                        expense_date: expense.expense_date,
                                        category: categoryToLabel(expense.category),
                                        description: displayDescription,
                                        amount: expense.amount,
                                        handler: displayHandler,
                                      });
                                    }}>
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => handleDelete(expense.id)}>
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
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
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5"/> 每日營業額結算</CardTitle>
              <CardDescription>記錄各項收款來源，或直接與 POSPAL 系統同步</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 justify-end mb-4">
                <Button variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> POSPAL API 同步</Button>
                <Button variant="secondary"><Camera className="w-4 h-4 mr-2" /> OCR 結算單辨識</Button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">日期選擇</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full md:w-1/3" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">現金 (Cash)</label><Input type="number" placeholder="0.00" value={revenue.cash} onChange={e => setRevenue({...revenue, cash: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">八達通 (Octopus)</label><Input type="number" placeholder="0.00" value={revenue.octopus} onChange={e => setRevenue({...revenue, octopus: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Alipay+WeChat</label><Input type="number" placeholder="0.00" value={revenue.alipay_wechat} onChange={e => setRevenue({...revenue, alipay_wechat: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">外賣平台 (Delivery)</label><Input type="number" placeholder="0.00" value={revenue.delivery} onChange={e => setRevenue({...revenue, delivery: e.target.value})} /></div>
              </div>
              <div className="pt-4 flex justify-end">
                <Button className="w-full md:w-auto">提交結算同步</Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>收工結算點交 (Safe Settlement)</CardTitle>
              <CardDescription>上傳手寫打烊對帳單或保險箱現金照片，AI 自動計算誤差</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50">
                <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">AI 結算圖片上傳</p>
                <p className="text-sm text-muted-foreground mt-1">系統將自動比對「理論現金」與「實際現金庫存」</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
