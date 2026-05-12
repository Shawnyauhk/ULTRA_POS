import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, Calendar, 
  Trash2, Sparkles, User, Edit2, Save, X, Calculator, RefreshCw
} from 'lucide-react';

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  handler: string;
}

const CATEGORIES = [
  '進貨成本', '租金', '行銷', '水電瓦斯', 
  '薪資', '設備雜支', '一般支出', '其他'
];

const DEMO_EXPENSES: Expense[] = [
  { id: '1', category: '進貨成本', amount: 2500, description: '鮮奶、糖水原料', expense_date: '2026-05-07', handler: 'Shawn' },
  { id: '2', category: '水電瓦斯', amount: 3200, description: '4月電費', expense_date: '2026-05-01', handler: 'Admin' },
];

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement'>('expenses');
  
  // Expenses State
  const [expenses, setExpenses] = useState<Expense[]>(DEMO_EXPENSES);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});
  
  // Settlement State
  const [revenue, setRevenue] = useState({ cash: '', octopus: '', alipay_wechat: '', delivery: '' });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // AI OCR States
  const [showOCR, setShowOCR] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: '進貨成本', amount: 0, description: '', handler: '', expense_date: new Date().toISOString().split('T')[0],
  });

  const handleAddExpense = () => {
    const newEntry: Expense = {
      id: Date.now().toString(),
      category: newExpense.category || '其他',
      amount: newExpense.amount || 0,
      description: newExpense.description || '',
      handler: newExpense.handler || '未指定',
      expense_date: newExpense.expense_date || new Date().toISOString().split('T')[0],
    };
    setExpenses([newEntry, ...expenses]);
    setShowAddForm(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      setOcrPreview(event.target?.result as string);
      // Mock Gemini OCR
      setTimeout(() => {
        setNewExpense({
          category: '其他', amount: 150.5, description: 'Gemini 解析收據商品', handler: 'AI', expense_date: new Date().toISOString().split('T')[0],
        });
      }, 1500);
    };
    reader.readAsDataURL(file);
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
            <Button variant="outline" onClick={() => setShowOCR(!showOCR)}><Sparkles className="w-4 h-4 mr-2" /> Gemini AI 掃描收據</Button>
            <Button onClick={() => setShowAddForm(true)}><Receipt className="w-4 h-4 mr-2" /> 手動記帳</Button>
          </div>

          {showOCR && (
            <Card>
              <CardHeader><CardTitle>Gemini AI 智能識別收據</CardTitle></CardHeader>
              <CardContent>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                {!ocrPreview ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p>點擊上傳收據照片交由 Gemini 分析</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <img src={ocrPreview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
                    <div className="space-y-4">
                      <p>解析結果：${newExpense.amount}</p>
                      <Button onClick={() => { handleAddExpense(); setShowOCR(false); setOcrPreview(null); }}>確認添加</Button>
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
                  <div><label>金額</label><Input type="number" value={newExpense.amount || ''} onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})} /></div>
                  <div><label>日期</label><Input type="date" value={newExpense.expense_date || ''} onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})} /></div>
                  <div>
                    <label>分類</label>
                    <Select value={newExpense.category} onValueChange={v => setNewExpense({...newExpense, category: v})} options={CATEGORIES.map(cat => ({ value: cat, label: cat }))} />
                  </div>
                  <div><label>描述</label><Input value={newExpense.description || ''} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                  <div><label>經手人</label><Input value={newExpense.handler || ''} onChange={e => setNewExpense({...newExpense, handler: e.target.value})} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>取消</Button>
                  <Button onClick={handleAddExpense}>確認</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>支出記錄</CardTitle></CardHeader>
            <CardContent>
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
                    {expenses.map(expense => (
                      <tr key={expense.id} className="border-b hover:bg-gray-50">
                        {editingId === expense.id ? (
                          <>
                            <td className="px-4 py-2"><Input type="date" value={editForm.expense_date} onChange={e => setEditForm({...editForm, expense_date: e.target.value})} /></td>
                            <td className="px-4 py-2"><Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})} options={CATEGORIES.map(c => ({value: c, label: c}))} /></td>
                            <td className="px-4 py-2"><Input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                            <td className="px-4 py-2"><Input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} /></td>
                            <td className="px-4 py-2"><Input value={editForm.handler} onChange={e => setEditForm({...editForm, handler: e.target.value})} /></td>
                            <td className="px-4 py-2 flex gap-2">
                              <Button size="icon" variant="ghost" onClick={() => { setExpenses(expenses.map(e => e.id === editingId ? { ...e, ...editForm } as Expense : e)); setEditingId(null); }}><Save className="w-4 h-4 text-green-600" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-gray-500" /></Button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">{expense.expense_date}</td>
                            <td className="px-4 py-3"><Badge variant="secondary">{expense.category}</Badge></td>
                            <td className="px-4 py-3">{expense.description}</td>
                            <td className="px-4 py-3 font-medium">${expense.amount}</td>
                            <td className="px-4 py-3"><div className="flex items-center gap-1"><User className="w-3 h-3"/>{expense.handler}</div></td>
                            <td className="px-4 py-3 flex gap-2">
                              <Button size="icon" variant="ghost" onClick={() => { setEditingId(expense.id); setEditForm(expense); }}><Edit2 className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setExpenses(expenses.filter(e => e.id !== expense.id))}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <Button onClick={() => alert('結算數據已同步至資料庫！')} className="w-full md:w-auto">提交結算同步</Button>
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
