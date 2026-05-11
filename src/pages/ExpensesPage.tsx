import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  Camera, Receipt, DollarSign, Calendar, 
  Tag, Trash2, Check, Sparkles, FileText 
} from 'lucide-react';
import { recognizeReceipt, getOCRConfig, getAvailableProviders } from '../lib/ocr';

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  receipt_url?: string;
  created_at: string;
}

const CATEGORIES = [
  '食材原料', '包裝用品', '設備維修', '水電煤', 
  '租金', '交通費', '清潔用品', '員工支出', '其他'
];

// 示範數據
const DEMO_EXPENSES: Expense[] = [
  { id: '1', category: '食材原料', amount: 2500, description: '鮮奶、糖水原料', expense_date: '2026-05-07', created_at: '2026-05-07' },
  { id: '2', category: '包裝用品', amount: 800, description: '紙杯、膠袋', expense_date: '2026-05-06', created_at: '2026-05-06' },
  { id: '3', category: '水電煤', amount: 3200, description: '4月電費', expense_date: '2026-05-01', created_at: '2026-05-01' },
  { id: '4', category: '食材原料', amount: 1500, description: '雞蛋、麵粉', expense_date: '2026-05-05', created_at: '2026-05-05' },
  { id: '5', category: '清潔用品', amount: 350, description: '清潔劑、抹布', expense_date: '2026-05-04', created_at: '2026-05-04' },
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

  // 新支出表單
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: '食材原料',
    amount: 0,
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  // 當前 OCR 配置
  const ocrConfig = getOCRConfig();
  const providers = getAvailableProviders();

  // 過濾支出
  const filteredExpenses = expenses.filter(e => {
    if (filter.category !== '全部' && e.category !== filter.category) return false;
    if (filter.month && !e.expense_date.startsWith(filter.month)) return false;
    return true;
  });

  // 月度統計
  const monthlyTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryTotals = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
    return acc;
  }, {} as Record<string, number>);

  // 添加支出
  const handleAddExpense = (expense: Partial<Expense>) => {
    const newEntry: Expense = {
      id: Date.now().toString(),
      category: expense.category || '其他',
      amount: expense.amount || 0,
      description: expense.description || '',
      expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
      receipt_url: expense.receipt_url,
      created_at: new Date().toISOString(),
    };
    setExpenses([newEntry, ...expenses]);
    setShowAddForm(false);
    setNewExpense({ category: '食材原料', expense_date: new Date().toISOString().split('T')[0] });
  };

  // 刪除支出
  const handleDelete = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  // OCR 處理
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
          description: result.items.join(', ') || result.merchant || '',
          expense_date: result.date || new Date().toISOString().split('T')[0],
          receipt_url: base64,
        });
      } catch (error) {
        console.error('OCR 識別失敗:', error);
        alert('OCR 識別失敗，請手動輸入');
      } finally {
        setOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">支出記帳</h1>
          <p className="text-muted-foreground">管理店鋪日常支出，支援 OCR 自動識別收據</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowOCR(!showOCR)}>
            <Sparkles className="w-4 h-4 mr-2" />
            AI 掃描收據
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Receipt className="w-4 h-4 mr-2" />
            手動記帳
          </Button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">本月支出</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${monthlyTotal.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {filteredExpenses.length} 筆記錄
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">食材原料</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${categoryTotals['食材原料'].toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">包裝用品</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${categoryTotals['包裝用品'].toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">其他支出</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${Object.entries(categoryTotals)
                .filter(([cat]) => !['食材原料', '包裝用品'].includes(cat))
                .reduce((sum, [, amt]) => sum + amt, 0)
                .toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI OCR 區塊 */}
      {showOCR && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              AI 智能識別收據
            </CardTitle>
            <CardDescription>
              使用 {providers.find(p => p.id === ocrConfig?.provider)?.name || 'N/A'} OCR
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
            
            {!ocrPreview ? (
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">點擊上傳收據照片</p>
                <p className="text-sm text-muted-foreground">或使用相機拍攝</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <img 
                    src={ocrPreview} 
                    alt="收據預覽" 
                    className="w-full max-h-64 object-contain rounded-lg border"
                  />
                  <Button variant="outline" className="w-full" onClick={() => {
                    setOcrPreview(null);
                    setOcrResult(null);
                  }}>
                    重新拍攝
                  </Button>
                </div>
                
                {ocrProcessing ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3">AI 識別中...</span>
                  </div>
                ) : ocrResult ? (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-green-600">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">識別成功</span>
                      <Badge variant="outline" className="ml-auto">{ocrResult.provider}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">金額</p>
                        <p className="font-bold text-lg">${ocrResult.amount?.toLocaleString() || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">日期</p>
                        <p className="font-medium">{ocrResult.date || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">商戶</p>
                        <p className="font-medium">{ocrResult.merchant || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">置信度</p>
                        <p className="font-medium">{(ocrResult.confidence * 100).toFixed(0)}%</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">識別商品</p>
                        <p className="text-sm">{ocrResult.items?.join(', ') || '-'}</p>
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => {
                      handleAddExpense(ocrResult);
                      setShowOCR(false);
                      setOcrPreview(null);
                      setOcrResult(null);
                    }}>
                      確認添加
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 手動添加表單 */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>新增支出</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">金額</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newExpense.amount || ''}
                  onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">日期</label>
                <Input
                  type="date"
                  value={newExpense.expense_date || ''}
                  onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">分類</label>
                <Select 
                  value={newExpense.category} 
                  onValueChange={v => setNewExpense({...newExpense, category: v})}
                  options={CATEGORIES.map(cat => ({ value: cat, label: cat }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">描述</label>
                <Input
                  placeholder="支出說明"
                  value={newExpense.description || ''}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>取消</Button>
              <Button onClick={() => handleAddExpense(newExpense)}>確認添加</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 篩選器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Select value={filter.category} onValueChange={v => setFilter({...filter, category: v})}
              options={[{ value: '全部', label: '全部分類' }, ...CATEGORIES.map(cat => ({ value: cat, label: cat }))]}
            />
            <Input
              type="month"
              className="w-[180px]"
              value={filter.month}
              onChange={e => setFilter({...filter, month: e.target.value})}
            />
          </div>
        </CardContent>
      </Card>

      {/* 支出列表 */}
      <Card>
        <CardHeader>
          <CardTitle>支出記錄</CardTitle>
          <CardDescription>共 {filteredExpenses.length} 筆記錄</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredExpenses.map(expense => (
              <div 
                key={expense.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Receipt className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">${expense.amount.toLocaleString()}</span>
                      <Badge variant="secondary">{expense.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{expense.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {expense.expense_date}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleDelete(expense.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredExpenses.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暫無支出記錄</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
