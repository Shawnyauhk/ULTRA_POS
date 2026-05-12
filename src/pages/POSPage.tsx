import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Camera, RefreshCw } from 'lucide-react';

export function POSPage() {
  const [revenue, setRevenue] = useState({
    cash: '',
    octopus: '',
    alipay_wechat: '',
    delivery: ''
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = () => {
    alert('營業額已同步至 Supabase！');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">POS 收銀管理</h1>
          <p className="text-muted-foreground">每日營業額登記與 POSPAL 同步</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            POSPAL API 同步
          </Button>
          <Button variant="secondary">
            <Camera className="w-4 h-4 mr-2" />
            AI 截圖辨識匯入
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>每日營業額手動登記</CardTitle>
          <CardDescription>請輸入各項收款金額</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">日期選擇</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full md:w-1/3" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">現金 (Cash)</label>
              <Input type="number" placeholder="0.00" value={revenue.cash} onChange={e => setRevenue({...revenue, cash: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">八達通 (Octopus)</label>
              <Input type="number" placeholder="0.00" value={revenue.octopus} onChange={e => setRevenue({...revenue, octopus: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alipay+WeChat</label>
              <Input type="number" placeholder="0.00" value={revenue.alipay_wechat} onChange={e => setRevenue({...revenue, alipay_wechat: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">外賣平台 (Delivery)</label>
              <Input type="number" placeholder="0.00" value={revenue.delivery} onChange={e => setRevenue({...revenue, delivery: e.target.value})} />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button onClick={handleSubmit} className="w-full md:w-auto">提交結算同步至雲端</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
