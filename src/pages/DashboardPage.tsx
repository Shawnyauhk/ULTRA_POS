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
  RefreshCw
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useOrders, useExpenses } from '@/hooks/useSupabaseData'
import { useRealtime } from '@/hooks/useRealtime'
import { analyzeSalesWithAI } from '@/lib/ai-analysis'
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
    </div>
  )
}
