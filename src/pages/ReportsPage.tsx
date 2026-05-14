import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, 
  Users, BarChart3, Sparkles, Lightbulb, AlertTriangle,
  Loader2
} from 'lucide-react';
import { analyzeSalesWithAI, getAIConfig, getAvailableProviders } from '../lib/ai-analysis';
import { useOrders, useExpenses } from '@/hooks/useSupabaseData';

interface SalesData {
  date: string;
  amount: number;
  orders: number;
}

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('week');
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { orders, loading: ordersLoading } = useOrders(200);
  const { expenses, loading: expensesLoading } = useExpenses();

  // 從真實訂單數據生成報表
  const { sales, categories, totalSales, totalOrders, avgOrderValue } = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === 'completed');
    
    // 計算時間範圍
    const now = new Date();
    let startDate: Date;
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const filtered = completedOrders.filter(o => new Date(o.created_at) >= startDate);
    
    // 按日期彙總每日銷售
    const dailyMap: Record<string, { amount: number; orders: number }> = {};
    filtered.forEach(order => {
      const day = order.created_at.split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { amount: 0, orders: 0 };
      dailyMap[day].amount += order.final_amount;
      dailyMap[day].orders += 1;
    });

    const salesData: SalesData[] = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, data]) => ({ date, ...data }));

    // 從訂單項目計算分類銷售
    const categoryMap: Record<string, number> = {};
    filtered.forEach(order => {
      const items = (order as any).items || [];
      items.forEach((item: any) => {
        const catName = item.product_name || '其他';
        if (!categoryMap[catName]) categoryMap[catName] = 0;
        categoryMap[catName] += item.subtotal || (item.unit_price * item.quantity);
      });
    });

    // 如果沒有訂單項目，使用訂單本身作為銷售來源
    if (Object.keys(categoryMap).length === 0) {
      filtered.forEach(order => {
        const cat = 'POS 銷售';
        if (!categoryMap[cat]) categoryMap[cat] = 0;
        categoryMap[cat] += order.final_amount;
      });
    }

    const sortedCats = Object.entries(categoryMap).sort(([, a], [, b]) => b - a);
    const totalCatAmount = sortedCats.reduce((sum, [, v]) => sum + v, 0);
    const categoryData: CategoryData[] = sortedCats.map(([category, amount]) => ({
      category,
      amount,
      percentage: totalCatAmount > 0 ? Math.round((amount / totalCatAmount) * 100) : 0,
    }));

    const totalSalesNum = salesData.reduce((sum, s) => sum + s.amount, 0);
    const totalOrdersNum = salesData.reduce((sum, s) => sum + s.orders, 0);
    const avgOrderVal = totalOrdersNum > 0 ? totalSalesNum / totalOrdersNum : 0;

    return {
      sales: salesData.length > 0 ? salesData : [
        { date: now.toISOString().split('T')[0], amount: 0, orders: 0 }
      ],
      categories: categoryData.length > 0 ? categoryData : [
        { category: '暫無數據', amount: 0, percentage: 100 }
      ],
      totalSales: totalSalesNum,
      totalOrders: totalOrdersNum,
      avgOrderValue: avgOrderVal,
    };
  }, [orders, period]);

  // 計算變化百分比
  const salesChange = useMemo(() => {
    if (sales.length < 2) return '0.0';
    const first = sales[0].amount;
    const last = sales[sales.length - 1].amount;
    if (first === 0) return '0.0';
    return (((last - first) / first) * 100).toFixed(1);
  }, [sales]);

  const aiConfig = getAIConfig();
  const providers = getAvailableProviders();

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    try {
      const result = await analyzeSalesWithAI({
        dailySales: sales.map(s => ({ date: s.date, amount: s.amount })),
        categorySales: categories.map(c => ({ category: c.category, amount: c.amount })),
        topProducts: categories.slice(0, 3).map(c => ({
          name: c.category,
          quantity: Math.round(c.amount / (avgOrderValue || 1)),
        })),
      });
      setAiInsights(result);
    } catch (error) {
      console.error('AI 分析失敗:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const bestProduct = categories.reduce((best, cat) => 
    cat.amount > (best?.amount || 0) ? cat : best, categories[0]);
  const worstProduct = categories.reduce((worst, cat) => 
    cat.amount < (worst?.amount || Infinity) ? cat : worst, categories[0]);

  if (ordersLoading || expensesLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-2">載入數據中...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">數據報表</h1>
          <p className="text-muted-foreground">查看銷售趨勢和 AI 智能建議</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}
            options={[
              { value: 'today', label: '今日' },
              { value: 'week', label: '本週' },
              { value: 'month', label: '本月' },
              { value: 'year', label: '本年' }
            ]}
          />
          <Button onClick={handleAIAnalysis} disabled={aiLoading}>
            <Sparkles className="w-4 h-4 mr-2" />
            {aiLoading ? '分析中...' : 'AI 智能分析'}
          </Button>
        </div>
      </div>

      {/* AI 提供者提示 */}
      {aiConfig && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>使用 AI 提供者：</span>
          <Badge variant="outline">{providers.find(p => p.id === aiConfig.provider)?.name}</Badge>
          <span>模型：{aiConfig.model}</span>
        </div>
      )}

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">總銷售額</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSales.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-sm">
              {parseFloat(salesChange) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className={parseFloat(salesChange) >= 0 ? 'text-green-500' : 'text-red-500'}>
                {salesChange}%
              </span>
              <span className="text-muted-foreground">vs 上期</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">訂單數量</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">筆訂單</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">平均訂單金額</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgOrderValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">每筆訂單</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">總支出</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">期間內支出總額</p>
          </CardContent>
        </Card>
      </div>

      {/* AI 智能建議 */}
      {aiInsights && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Lightbulb className="w-5 h-5" />
                AI 洞察
                <Badge variant="outline" className="ml-auto">{aiInsights.provider}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {aiInsights.insights?.map((insight: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-yellow-600">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Sparkles className="w-5 h-5" />
                經營建議
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {aiInsights.recommendations?.map((rec: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-600">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
              {aiInsights.peakHours?.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium text-blue-800">建議繁忙時段：</p>
                  <div className="flex gap-2 mt-2">
                    {aiInsights.peakHours.map((hour: string, i: number) => (
                      <Badge key={i} variant="secondary">{hour}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 暢銷/滯銷產品 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <TrendingUp className="w-5 h-5" />
              暢銷產品
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestProduct && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-lg">{bestProduct.category}</p>
                    <p className="text-sm text-muted-foreground">銷售額</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl text-green-600">${bestProduct.amount.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{bestProduct.percentage}%</p>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${bestProduct.percentage}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-5 h-5" />
              待優化產品
            </CardTitle>
          </CardHeader>
          <CardContent>
            {worstProduct && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-lg">{worstProduct.category}</p>
                    <p className="text-sm text-muted-foreground">銷售額</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl text-orange-600">${worstProduct.amount.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{worstProduct.percentage}%</p>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{ width: `${worstProduct.percentage}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 銷售趨勢圖 */}
      <Card>
        <CardHeader>
          <CardTitle>銷售趨勢</CardTitle>
          <CardDescription>近 7 天銷售額變化（來自真實訂單數據）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-end justify-between gap-4 p-4">
            {sales.map((day, i) => {
              const maxAmount = Math.max(...sales.map(s => s.amount), 1);
              const height = (day.amount / maxAmount) * 250;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="relative group">
                    <div 
                      className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all hover:opacity-80"
                      style={{ height: `${height}px`, minHeight: '4px' }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                      ${day.amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {day.date.split('-')[2]}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 產品分類銷售 */}
      <Card>
        <CardHeader>
          <CardTitle>分類銷售佔比</CardTitle>
          <CardDescription>各類別產品銷售額比例</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {categories.map((cat, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{cat.category}</span>
                  <div className="flex items-center gap-4">
                    <span>${cat.amount.toLocaleString()}</span>
                    <Badge variant="secondary">{cat.percentage}%</Badge>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div 
                    className="h-3 rounded-full transition-all"
                    style={{ 
                      width: `${cat.percentage}%`,
                      backgroundColor: [
                        'hsl(142, 76%, 36%)',
                        'hsl(200, 98%, 39%)',
                        'hsl(262, 83%, 58%)',
                        'hsl(25, 95%, 53%)',
                        'hsl(174, 100%, 30%)',
                        'hsl(0, 0%, 70%)',
                      ][i % 6]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
