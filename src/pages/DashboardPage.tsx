import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  BarChart4,
  AlertCircle
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState({
    netProfit: 45000,
    cashIn: 120000,
    cashOut: 75000,
  })

  const [chartData, setChartData] = useState([
    { name: '1號', income: 4000, expense: 2400 },
    { name: '5號', income: 3000, expense: 1398 },
    { name: '10號', income: 2000, expense: 9800 },
    { name: '15號', income: 2780, expense: 3908 },
    { name: '20號', income: 1890, expense: 4800 },
    { name: '25號', income: 2390, expense: 3800 },
    { name: '30號', income: 3490, expense: 4300 },
  ]);

  const [generatingReport, setGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);

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

  useEffect(() => {
    // 預留加載數據的邏輯
  }, [])

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
                <p className="text-3xl font-bold text-green-600">${stats.netProfit.toLocaleString()}</p>
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
                <p className="text-3xl font-bold text-blue-600">${stats.cashIn.toLocaleString()}</p>
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
                <p className="text-3xl font-bold text-red-600">${stats.cashOut.toLocaleString()}</p>
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
