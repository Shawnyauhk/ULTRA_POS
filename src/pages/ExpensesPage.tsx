import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, DollarSign, Calendar, 
  Tag, Trash2, Check, Sparkles, FileText, User, Edit2, Save, X
} from 'lucide-react';
import { recognizeReceipt, getOCRConfig, getAvailableProviders } from '../lib/ocr';

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  handler: string;
  receipt_url?: string;
  created_at: string;
}

const CATEGORIES = [
  '進貨成本', '租金', '行銷', '水電瓦斯', 
  '薪資', '設備雜支', '一般支出', '其他'
];

const DEMO_EXPENSES: Expense[] = [
  { id: '1', category: '進貨成本', amount: 2500, description: '鮮奶、糖水原料', expense_date: '2026-05-07', handler: 'Shawn', created_at: '2026-05-07' },
  { id: '2', category: '水電瓦斯', amount: 3200, description: '4月電費', expense_date: '2026-05-01', handler: 'Admin', created_at: '2026-05-01' },
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>(DEMO_EXPENSES);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOCR, setShowOCR] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [filter, setFilter] = useState({ category: '全部', month: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});

  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: '進貨成本',
    amount: 0,
    description: '',
    handler: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const ocrConfig = getOCRConfig();
  const providers = getAvailableProviders();

  const filteredExpenses = expenses.filter(e => {
    if (filter.category !== '全部' && e.category !== filter.category) return false;
    if (filter.month && !e.expense_date.startsWith(filter.month)) return false;
    return true;
  });

  const monthlyTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleAddExpense = (expense: Partial<Expense>) => {
    const newEntry: Expense = {
      id: Date.now().toString(),
      category: expense.category || '其他',
      amount: expense.amount || 0,
      description: expense.description || '',
      handler: expense.handler || '未指定',
      expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
      receipt_url: expense.receipt_url,
      created_at: new Date().toISOString(),
    };
    setExpenses([newEntry, ...expenses]);
    setShowAddForm(false);
    setNewExpense({ category: '進貨成本', handler: '', description: '', amount: 0, expense_date: new Date().toISOString().split('T')[0] });
  };

  const handleDelete = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const handleEditClick = (expense: Expense) => {
    setEditingId(expense.id);
    setEditForm(expense);
  };

  const handleSaveEdit = () => {
    setExpenses(expenses.map(e => e.id === editingId ? { ...e, ...editForm } as Expense : e));
    setEditingId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setOcrPreview(base64);
      setOcrProcessing(true);
      setOcrResult(null);

      try {
        const result = await recognizeReceipt(base64);
        setOcrResult(result);
        setNewExpense({
          category: '其他',
          amount: result.amount || 0,
          description: result.items?.join(', ') || result.merchant || '',
          handler: '',
          expense_date: result.date || new Date().toISOString().split('T')[0],
          receipt_url: base64,
        });
      } catch (error) {
        console.error('OCR Error:', error);
        alert('OCR Failed');
      } finally {
        setOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">門店支出 Expenses</h1>
          <p className="text-muted-foreground">管理店鋪日常支出與收工結算</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowOCR(!showOCR)}>
            <Sparkles className="w-4 h-4 mr-2" /> AI 掃描收據
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Receipt className="w-4 h-4 mr-2" /> 手動記帳
          </Button>
        </div>
      </div>

      {showOCR && (
        <Card>
          <CardHeader>
            <CardTitle>AI 智能識別收據</CardTitle>
          </CardHeader>
          <CardContent>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            {!ocrPreview ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p>點擊上傳收據照片</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <img src={ocrPreview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
                {ocrProcessing ? <p>AI 識別中...</p> : (
                  <div className="space-y-4">
                    <p>Amount: ${ocrResult?.amount}</p>
                    <p>Date: {ocrResult?.date}</p>
                    <Button onClick={() => { handleAddExpense(newExpense); setShowOCR(false); setOcrPreview(null); }}>確認添加</Button>
                  </div>
                )}
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
              <Button onClick={() => handleAddExpense(newExpense)}>確認</Button>
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
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className="border-b hover:bg-gray-50">
                    {editingId === expense.id ? (
                      <>
                        <td className="px-4 py-2"><Input type="date" value={editForm.expense_date} onChange={e => setEditForm({...editForm, expense_date: e.target.value})} /></td>
                        <td className="px-4 py-2"><Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})} options={CATEGORIES.map(c => ({value: c, label: c}))} /></td>
                        <td className="px-4 py-2"><Input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                        <td className="px-4 py-2"><Input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} /></td>
                        <td className="px-4 py-2"><Input value={editForm.handler} onChange={e => setEditForm({...editForm, handler: e.target.value})} /></td>
                        <td className="px-4 py-2 flex gap-2">
                          <Button size="icon" variant="ghost" onClick={handleSaveEdit}><Save className="w-4 h-4 text-green-600" /></Button>
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
                          <Button size="icon" variant="ghost" onClick={() => handleEditClick(expense)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(expense.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
      
      {/* 3.2 收工結算點交 */}
      <Card>
        <CardHeader>
          <CardTitle>收工結算點交 (Safe Settlement)</CardTitle>
          <CardDescription>上傳手寫打烊對帳單或現金照片，AI 自動計算誤差</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer">
            <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">AI 結算圖片上傳</p>
            <p className="text-sm text-muted-foreground">自動比對「系統理論現金」與「AI 解析實際現金」</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
