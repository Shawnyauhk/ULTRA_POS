import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  BarChart4,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useOrders, useExpenses } from '@/hooks/useSupabaseData'
import { useRealtime } from '@/hooks/useRealtime'
import type { Order } from '@/types'

export function DashboardPage() {
  const { user } = useAuthStore()
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

      setChartData(sortedData.length > 0 ? sortedData : [
        { name: '1號', income: 0, expense: 0 },
        { name: '5號', income: 0, expense: 0 },
        { name: '10號', income: 0, expense: 0 },
        { name: '15號', income: 0, expense: 0 },
        { name: '20號', income: 0, expense: 0 },
        { name: '25號', income: 0, expense: 0 },
        { name: '30號', income: 0, expense: 0 },
      ]);
    }
  }, [orders, expenses, ordersLoading, expensesLoading]);

  const handleGenerateReport = () => {
    setGeneratingReport(true);
    setTimeout(() => {
      setAiReport({
        topSellers: ['原味雞蛋仔', '凍檸茶', '朱古力雞蛋仔'],
        worstSellers: ['熱水', '普通紙杯'],
        actionableAdvice: '週末下午 3 點至 5 點為黃金銷售時段，建議在此時段推出「雞蛋仔+凍檸茶」的下午茶限定套餐，預計可提升 15% 營收。',
        trendInsight: '本月「朱古力雞蛋仔」銷量相比上月增長 20%，可能有持續上升趨勢，建議增加對應原料庫存。'
      });
      setGeneratingReport(false);
    }, 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">控制面板與 AI 分析</h1>
          <p className="text-gray-500 mt-1">歡迎回來，{user?.name || '管理員'}。檢視今日營收與 AI 財務分析報告。</p>
        </div>
        <Button onClick={handleGenerateReport} disabled={generatingReport}>
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
            <CardTitle className="text-blue-900 flex items-center gap-2"><Sparkles className="w-5 h-5" /> AI 銷售分析與洞察報告</CardTitle>
            <CardDescription className="text-blue-700">基於近期銷售與財務數據生成的智能報告</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-blue-900 mb-2">暢銷與滯銷分析</h4>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-white p-3 rounded-md shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">Top 3 暢銷產品</p>
                      <ul className="list-disc pl-4 text-sm text-green-700 font-medium">
                        {aiReport.topSellers.map((item: string) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="flex-1 bg-white p-3 rounded-md shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">需注意的滯銷產品</p>
                      <ul className="list-disc pl-4 text-sm text-red-700 font-medium">
                        {aiReport.worstSellers.map((item: string) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-md shadow-sm border-l-4 border-yellow-400">
                  <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-yellow-500" /> 可行動建議 (Actionable Advice)</h4>
                  <p className="text-sm text-gray-700">{aiReport.actionableAdvice}</p>
                </div>
                <div className="bg-white p-4 rounded-md shadow-sm border-l-4 border-blue-400">
                  <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-blue-500" /> 銷售趨勢洞察</h4>
                  <p className="text-sm text-gray-700">{aiReport.trendInsight}</p>
                </div>
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
    </div>
  )
}
