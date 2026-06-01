import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  BarChart4,
  AlertCircle,
  Loader2,
  RefreshCw,
  BarChart3,
  TrendingDown,
  ShoppingCart,
  Users,
  Lightbulb
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useOrders, useExpenses } from '@/hooks/useSupabaseData'
import { useRealtime } from '@/hooks/useRealtime'
import { analyzeSalesWithAI } from '@/lib/ai-analysis'
import type { Order } from '@/types'

// --- Report sub-components ---

interface SalesData { date: string; amount: number; orders: number }
interface CategoryData { category: string; amount: number; percentage: number }

function ReportsContent() {
  const [period, setPeriod] = useState('week');
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { orders, loading: ordersLoading } = useOrders(200);
  const { expenses, loading: expensesLoading } = useExpenses();

  const { sales, categories, totalSales, totalOrders, avgOrderValue } = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === 'completed');
    const now = new Date();
    let startDate: Date;
    if (period === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const filtered = completedOrders.filter(o => new Date(o.created_at) >= startDate);
    const dailyMap: Record<string, { amount: number; orders: number }> = {};
    filtered.forEach(order => {
      const day = order.created_at.split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { amount: 0, orders: 0 };
      dailyMap[day].amount += order.final_amount;
      dailyMap[day].orders += 1;
    });
    const salesData: SalesData[] = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, data]) => ({ date, ...data }));

    const categoryMap: Record<string, number> = {};
    filtered.forEach(order => {
      const items = (order as any).items || [];
      items.forEach((item: any) => {
        const catName = item.product_name || '其他';
        if (!categoryMap[catName]) categoryMap[catName] = 0;
        categoryMap[catName] += item.subtotal || (item.unit_price * item.quantity);
      });
    });
    if (Object.keys(categoryMap).length === 0) {
      filtered.forEach(order => { categoryMap['POS 銷售'] = (categoryMap['POS 銷售'] || 0) + order.final_amount; });
    }
    const sortedCats = Object.entries(categoryMap).sort(([, a], [, b]) => b - a);
    const totalCatAmount = sortedCats.reduce((sum, [, v]) => sum + v, 0);
    const categoryData: CategoryData[] = sortedCats.map(([category, amount]) => ({ category, amount, percentage: totalCatAmount > 0 ? Math.round((amount / totalCatAmount) * 100) : 0 }));

    const totalSalesCalc = salesData.reduce((sum, s) => sum + s.amount, 0);
    const totalOrdersCalc = salesData.reduce((sum, s) => sum + s.orders, 0);

    return {
      sales: salesData.length > 0 ? salesData : [{ date: now.toISOString().split('T')[0], amount: 0, orders: 0 }],
      categories: categoryData.length > 0 ? categoryData : [{ category: '暫無數據', amount: 0, percentage: 100 }],
      totalSales: totalSalesCalc,
      totalOrders: totalOrdersCalc,
      avgOrderValue: totalOrdersCalc > 0 ? totalSalesCalc / totalOrdersCalc : 0,
    };
  }, [orders, period]);

  const salesChange = useMemo(() => {
    if (sales.length < 2) return '0.0';
    const first = sales[0].amount;
    const last = sales[sales.length - 1].amount;
    if (first === 0) return '0.0';
    return (((last - first) / first) * 100).toFixed(1);
  }, [sales]);

  const bestProduct = categories.reduce((best, cat) => cat.amount > (best?.amount || 0) ? cat : best, categories[0]);
  const worstProduct = categories.reduce((worst, cat) => cat.amount < (worst?.amount || Infinity) ? cat : worst, categories[0]);

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    try {
      const result = await analyzeSalesWithAI({
        dailySales: sales.map(s => ({ date: s.date, amount: s.amount })),
        categorySales: categories.map(c => ({ category: c.category, amount: c.amount })),
        topProducts: categories.slice(0, 3).map(c => ({ name: c.category, quantity: Math.round(c.amount / (avgOrderValue || 1)) })),
      });
      setAiInsights(result);
    } catch (error) { console.error('AI 分析失敗:', error); } finally { setAiLoading(false); }
  };

  if (ordersLoading || expensesLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /><span className="ml-2">載入數據中...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">數據報表</h2>
          <p className="text-muted-foreground text-sm">查看銷售趨勢和 AI 智能建議</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="today">今日</option>
            <option value="week">本週</option>
            <option value="month">本月</option>
            <option value="year">本年</option>
          </select>
          <Button onClick={handleAIAnalysis} disabled={aiLoading}>
            <Sparkles className="w-4 h-4 mr-2" />{aiLoading ? '分析中...' : 'AI 智能分析'}
          </Button>
        </div>
      </div>

      {/*統計卡片*/}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">總銷售額</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">${totalSales.toLocaleString()}</div><div className="flex items-center gap-1 text-sm">{parseFloat(salesChange) >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}<span className={parseFloat(salesChange) >= 0 ? 'text-green-500' : 'text-red-500'}>{salesChange}%</span><span className="text-muted-foreground">vs 上期</span></div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">訂單數量</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totalOrders}</div><p className="text-xs text-muted-foreground">筆訂單</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">平均訂單金額</CardTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">${avgOrderValue.toFixed(0)}</div><p className="text-xs text-muted-foreground">每筆訂單</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">總支出</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">${expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}</div><p className="text-xs text-muted-foreground">期間內支出總額</p></CardContent></Card>
      </div>

      {/*AI 建議*/}
      {aiInsights && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-yellow-200 bg-yellow-50/50"><CardHeader><CardTitle className="flex items-center gap-2 text-yellow-800"><Lightbulb className="w-5 h-5" />AI 洞察<Badge variant="outline" className="ml-auto">{aiInsights.provider}</Badge></CardTitle></CardHeader><CardContent><ul className="space-y-2">{aiInsights.insights?.map((insight: string, i: number) => (<li key={i} className="flex items-start gap-2 text-sm"><span className="text-yellow-600">•</span><span>{insight}</span></li>))}</ul></CardContent></Card>
          <Card className="border-blue-200 bg-blue-50/50"><CardHeader><CardTitle className="flex items-center gap-2 text-blue-800"><Sparkles className="w-5 h-5" />經營建議</CardTitle></CardHeader><CardContent><ul className="space-y-2">{aiInsights.recommendations?.map((rec: string, i: number) => (<li key={i} className="flex items-start gap-2 text-sm"><span className="text-blue-600">•</span><span>{rec}</span></li>))}</ul>{aiInsights.peakHours?.length > 0 && (<div className="mt-4 pt-4 border-t"><p className="text-sm font-medium text-blue-800">建議繁忙時段：</p><div className="flex gap-2 mt-2">{aiInsights.peakHours.map((hour: string, i: number) => (<Badge key={i} variant="secondary">{hour}</Badge>))}</div></div>)}</CardContent></Card>
        </div>
      )}

      {/*暢銷/滯銷*/}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-green-200"><CardHeader><CardTitle className="flex items-center gap-2 text-green-700"><TrendingUp className="w-5 h-5" />暢銷產品</CardTitle></CardHeader><CardContent>{bestProduct && (<div className="space-y-4"><div className="flex items-center justify-between"><div><p className="font-medium text-lg">{bestProduct.category}</p><p className="text-sm text-muted-foreground">銷售額</p></div><div className="text-right"><p className="font-bold text-xl text-green-600">${bestProduct.amount.toLocaleString()}</p><p className="text-sm text-muted-foreground">{bestProduct.percentage}%</p></div></div><div className="w-full bg-muted rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${bestProduct.percentage}%` }} /></div></div>)}</CardContent></Card>
        <Card className="border-orange-200"><CardHeader><CardTitle className="flex items-center gap-2 text-orange-700"><AlertCircle className="w-5 h-5" />待優化產品</CardTitle></CardHeader><CardContent>{worstProduct && (<div className="space-y-4"><div className="flex items-center justify-between"><div><p className="font-medium text-lg">{worstProduct.category}</p><p className="text-sm text-muted-foreground">銷售額</p></div><div className="text-right"><p className="font-bold text-xl text-orange-600">${worstProduct.amount.toLocaleString()}</p><p className="text-sm text-muted-foreground">{worstProduct.percentage}%</p></div></div><div className="w-full bg-muted rounded-full h-2"><div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${worstProduct.percentage}%` }} /></div></div>)}</CardContent></Card>
      </div>

      {/*銷售趨勢圖*/}
      <Card><CardHeader><CardTitle>銷售趨勢</CardTitle><CardDescription>近 7 天銷售額變化（來自真實訂單數據）</CardDescription></CardHeader><CardContent><div className="h-[300px] flex items-end justify-between gap-4 p-4">{sales.map((day, i) => { const maxAmt = Math.max(...sales.map(s => s.amount), 1); const h = (day.amount / maxAmt) * 250; return (<div key={i} className="flex-1 flex flex-col items-center gap-2"><div className="relative group"><div className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all hover:opacity-80" style={{ height: `${h}px`, minHeight: '4px' }} /><div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">${day.amount.toLocaleString()}</div></div><div className="text-xs text-muted-foreground">{day.date.split('-')[2]}</div></div>); })}</div></CardContent></Card>

      {/*分類銷售*/}
      <Card><CardHeader><CardTitle>分類銷售佔比</CardTitle><CardDescription>各類別產品銷售額比例</CardDescription></CardHeader><CardContent><div className="space-y-4">{categories.map((cat, i) => (<div key={i} className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">{cat.category}</span><div className="flex items-center gap-4"><span>${cat.amount.toLocaleString()}</span><Badge variant="secondary">{cat.percentage}%</Badge></div></div><div className="w-full bg-muted rounded-full h-3"><div className="h-3 rounded-full transition-all" style={{ width: `${cat.percentage}%`, backgroundColor: ['hsl(142,76%,36%)','hsl(200,98%,39%)','hsl(262,83%,58%)','hsl(25,95%,53%)','hsl(174,100%,30%)','hsl(0,0%,70%)'][i % 6] }} /></div></div>))}</div></CardContent></Card>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports'>('dashboard');
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
  const { expenses, loading: expensesLoading, refetch: refetchExpenses } = useExpenses();

  // 即時同步：當訂單或開支變更時自動刷新儀表板
  useRealtime({ table: 'orders', onAll: () => refetchOrders() });
  useRealtime({ table: 'expenses', onAll: () => refetchExpenses() });
  
  const [stats, setStats] = useState({
    netProfit: 0,
    cashIn: 0,
    cashOut: 0,
  })

  const [chartData, setChartData] = useState<{name: string; income: number; expense: number}[]>([]);

  const [generatingReport, setGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);

  // Calculate stats from Supabase data
  useEffect(() => {
    if (!ordersLoading && !expensesLoading) {
      const totalCashIn = orders
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + o.final_amount, 0);
      
      const totalCashOut = expenses.reduce((sum, e) => sum + e.amount, 0);
      
      setStats({
        netProfit: totalCashIn - totalCashOut,
        cashIn: totalCashIn,
        cashOut: totalCashOut,
      });

      // Generate chart data by day
      const dailyData: Record<string, { income: number; expense: number }> = {};
      
      orders
        .filter(o => o.status === 'completed')
        .forEach(order => {
          const day = new Date(order.created_at).getDate();
          const key = `${day}號`;
          if (!dailyData[key]) {
            dailyData[key] = { income: 0, expense: 0 };
          }
          dailyData[key].income += order.final_amount;
        });
      
      expenses.forEach(expense => {
        const day = new Date(expense.expense_date).getDate();
        const key = `${day}號`;
        if (!dailyData[key]) {
          dailyData[key] = { income: 0, expense: 0 };
        }
        dailyData[key].expense += expense.amount;
      });

      const sortedData = Object.entries(dailyData)
        .sort(([a], [b]) => {
          const numA = parseInt(a.replace('號', ''));
          const numB = parseInt(b.replace('號', ''));
          return numA - numB;
        })
        .slice(0, 7)
        .map(([name, data]) => ({ name, ...data }));

      setChartData(sortedData.length > 0 ? sortedData : []);
    }
  }, [orders, expenses, ordersLoading, expensesLoading]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const completedOrders = orders.filter(o => o.status === 'completed');
      const totalSales = completedOrders.reduce((s, o) => s + o.final_amount, 0);
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
      
      const result = await analyzeSalesWithAI({
        dailySales: orders
          .filter(o => o.status === 'completed')
          .slice(0, 7)
          .map(o => ({ date: o.created_at.split('T')[0], amount: o.final_amount })),
        categorySales: [],
        topProducts: [],
      });
      setAiReport(result);
    } catch (err) {
      console.error('AI report generation error:', err);
      // Fallback to simulated data
      setAiReport({
        insights: ['暫時無法連接 AI 分析服務，顯示模擬數據'],
        recommendations: ['請檢查 NVIDIA NIM API Key 是否正確設定'],
        peakHours: ['12:00-14:00', '18:00-20:00'],
        provider: 'local',
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b pb-3">
        <Button
          variant={activeTab === 'dashboard' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart4 className="h-4 w-4 mr-1" />
          控制面板
        </Button>
        <Button
          variant={activeTab === 'reports' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('reports')}
        >
          <BarChart3 className="h-4 w-4 mr-1" />
          數據報表
        </Button>
      </div>

      {activeTab === 'reports' ? (
        <ReportsContent />
      ) : (
        <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-gray-900">控制面板與 AI 分析</h1>
          <p className="text-sm text-gray-500 mt-1">歡迎回來，{user?.name || '管理員'}。檢視今日營收與 AI 財務分析報告。</p>
        </div>
        <Button onClick={handleGenerateReport} disabled={generatingReport} className="self-start md:self-auto">
          {generatingReport ? (
            <span className="flex items-center"><Sparkles className="w-4 h-4 mr-2 animate-spin" /> 報告生成中...</span>
          ) : (
            <span className="flex items-center"><BarChart4 className="w-4 h-4 mr-2" /> 一鍵生成 AI 銷售報告</span>
          )}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">今日淨利潤 (Net Profit)</p>
                {ordersLoading || expensesLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold text-green-600">${stats.netProfit.toLocaleString()}</p>
                )}
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">本月現金收入 (Cash In)</p>
                {ordersLoading || expensesLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold text-blue-600">${stats.cashIn.toLocaleString()}</p>
                )}
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <ArrowUpRight className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">本月總支出 (Cash Out)</p>
                {ordersLoading || expensesLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold text-red-600">${stats.cashOut.toLocaleString()}</p>
                )}
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <ArrowDownRight className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Report Section */}
      {aiReport && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> AI 銷售分析與洞察報告
              <Badge variant="outline" className="ml-auto">{aiReport.provider}</Badge>
            </CardTitle>
            <CardDescription className="text-blue-700">基於近期銷售與財務數據生成的智能報告</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-blue-900 mb-2">AI 洞察</h4>
                  <ul className="space-y-2">
                    {aiReport.insights?.map((insight: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm bg-white p-3 rounded-md shadow-sm">
                        <span className="text-yellow-600 font-bold">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-md shadow-sm border-l-4 border-yellow-400">
                  <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" /> 經營建議
                  </h4>
                  <ul className="space-y-1">
                    {aiReport.recommendations?.map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700">• {rec}</li>
                    ))}
                  </ul>
                </div>
                {aiReport.peakHours?.length > 0 && (
                  <div className="bg-white p-4 rounded-md shadow-sm border-l-4 border-blue-400">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" /> 建議繁忙時段
                    </h4>
                    <div className="flex gap-2 flex-wrap">
                      {aiReport.peakHours.map((hour: string, i: number) => (
                        <Badge key={i} variant="secondary">{hour}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <CardTitle>現金流趨勢圖表 (Cash Flow Trend)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="income" stroke="#2563eb" name="現金收入" activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="expense" stroke="#dc2626" name="總支出" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  )
}
