import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Receipt, Trash2, User, Edit2, Save, X, RefreshCw, Loader2, Table2, FolderTree, Sparkles
} from 'lucide-react';
import { useExpenses } from '@/hooks/useSupabaseData';
import { useRealtimeExpenses } from '@/hooks/useRealtime';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import ExpenseTreeView from '@/components/expenses/ExpenseTreeView';
import DateRangeFilter from '@/components/ui/DateRangeFilter';
import { BatchOCRUpload } from '@/components/expenses/BatchOCRUpload';


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
  const { can } = usePermission();

  // 日期範圍篩選（預設本月）
  const today = new Date()
  const [filterStart, setFilterStart] = useState(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    return first.toISOString().split('T')[0]
  })
  const [filterEnd, setFilterEnd] = useState(() => today.toISOString().split('T')[0])

  // Supabase Hook（傳入日期範圍）
  const { expenses, loading, refetch, createExpense, updateExpense, deleteExpense } = useExpenses(filterStart, filterEnd);
  
  // 即時同步：當其他裝置修改開支時自動刷新
  useRealtimeExpenses(refetch);

  // UI State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');

  // OCR state
  const [showOCR, setShowOCR] = useState(false);

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

  // ====== AI 批量掃描（由 BatchOCRUpload 組件處理）======

  return (
    <div className="space-y-6">
      {/* 頁面標題 + 操作按鈕 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">門店支出</h1>
          <p className="text-muted-foreground">管理店鋪日常支出</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowOCR(!showOCR)}>
            <Sparkles className="w-4 h-4 mr-1.5" /> AI 掃描
          </Button>
          {can('expense.manage') && (
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Receipt className="w-4 h-4 mr-1.5" /> 手動記帳
            </Button>
          )}
        </div>
      </div>

      {/* AI 批量掃描區塊 */}
      {showOCR && <BatchOCRUpload onClose={() => setShowOCR(false)} />}

      {/* 手動記帳表單 */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">新增支出</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">金額 (HKD)</label>
                <Input type="number" value={newExpense.amount || ''}
                  onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">日期</label>
                <Input type="date" value={newExpense.expense_date || ''}
                  onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">分類</label>
                <Select value={newExpense.category}
                  onValueChange={v => setNewExpense({...newExpense, category: v})}
                  options={CATEGORY_DISPLAY.map(c => ({ value: c.label, label: c.label }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">供應商</label>
                <Input value={newExpense.supplier || ''}
                  onChange={e => setNewExpense({...newExpense, supplier: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">描述</label>
                <Input value={newExpense.description || ''}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">經手人</label>
                <Input value={newExpense.handler || ''}
                  onChange={e => setNewExpense({...newExpense, handler: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">付款狀態</label>
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
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>取消</Button>
              <Button size="sm" onClick={handleAddExpense} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}確認
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 支出記錄卡片 */}
      <Card className="overflow-visible">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">支出記錄</CardTitle>
          <div className="flex items-center gap-1">
            <div className="flex bg-gray-100 p-0.5 rounded-lg">
              <button onClick={() => setViewMode('tree')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'tree' ? 'bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                title="階層檢視">
                <FolderTree className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                title="表格檢視">
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={refetch}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* 日期篩選器 */}
          <div className="mb-4 px-1">
            <DateRangeFilter
              startDate={filterStart}
              endDate={filterEnd}
              onChange={(s, e) => { setFilterStart(s); setFilterEnd(e); }}
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">載入中...</span>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">暫無支出記錄，請點擊上方按鈕新增</p>
            </div>
          ) : viewMode === 'tree' ? (
            <ExpenseTreeView
              expenses={expenses}
              onEdit={(exp) => {
                setEditingId(exp.id);
                const handlerMatch = exp.description?.match(/\(經手人: (.+?)\)/);
                setEditForm({
                  expense_date: exp.expense_date,
                  category: categoryToLabel(exp.category),
                  description: exp.description?.replace(/\s*\(經手人: .+?\)\s*$/, '') || '',
                  amount: exp.amount,
                  handler: handlerMatch ? handlerMatch[1] : '',
                  payment_status: exp.payment_status || 'unpaid',
                  supplier: exp.supplier || '',
                });
              }}
              onDelete={(id) => setDeleteConfirmId(id)}
            />
          ) : (
            <div className="overflow-x-auto -mx-6">
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
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => handleSaveEdit(expense.id)} disabled={saving}>
                                  <Save className="w-3.5 h-3.5 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditingId(null)}>
                                  <X className="w-3.5 h-3.5 text-gray-500" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 whitespace-nowrap">{expense.expense_date}</td>
                            <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{categoryToLabel(expense.category)}</Badge></td>
                            <td className="px-4 py-3 whitespace-nowrap">{expense.supplier || '—'}</td>
                            <td className="px-4 py-3 max-w-[200px] truncate">{displayDescription}</td>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">${expense.amount}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1 text-gray-500">
                                <User className="w-3 h-3" />{displayHandler}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {expense.payment_status === 'cash' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">現</span>}
                              {expense.payment_status === 'bank' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">銀</span>}
                              {(!expense.payment_status || expense.payment_status === 'unpaid') && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">未</span>}
                            </td>
                            <td className="px-4 py-3">
                              {can('expense.manage') && (
                                <div className="flex gap-1">
                                  <button onClick={() => {
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
                                  }}
                                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(expense.id)}
                                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
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

      {/* Error Message Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setErrorMessage(null)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-2"><CardTitle className="text-base">錯誤</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4 whitespace-pre-wrap text-sm">{errorMessage}</p>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setErrorMessage(null)}>關閉</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleteConfirmId(null)}>
          <Card className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-2"><CardTitle className="text-base">確認刪除</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4 text-sm">確定要刪除此筆支出記錄？此操作無法復原。</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>取消</Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(deleteConfirmId)}>確認刪除</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
