import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DollarSign,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
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

  useEffect(() => {
    // 預留加載數據的邏輯
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">控制面板 Dashboard</h1>
        <p className="text-gray-500 mt-1">歡迎回來，{user?.name || '管理員'}</p>
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

      {/* Charts Section */}
      <Card className="col-span-3">
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
