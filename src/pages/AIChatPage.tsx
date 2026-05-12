import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Megaphone, MessageSquare, BookOpen, Star, Save } from 'lucide-react';

export function AIChatPage() {
  const [activeTab, setActiveTab] = useState<'marketing' | 'cs'>('cs');

  // AI Review States
  const [productName, setProductName] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');

  // CS States
  const [chatLogs] = useState([
    { id: 1, user: '請問營業到幾點？', ai: '我們營業到晚上 11 點哦！', status: '已訓練' },
    { id: 2, user: '元朗廣場那間是你們分店嗎？', ai: '不是喔，我們只有天水圍和元朗金輝徑兩家分店。', status: '待修正' }
  ]);

  const handleGenerateReview = () => {
    if (!productName) return;
    setGeneratedReview(`剛剛試咗佢哋嘅 ${productName}，味道真係一流！口感層次分明，唔會太甜，非常推薦大家嚟試下！⭐⭐⭐⭐⭐`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI 行銷與客服機器人</h1>
          <p className="text-muted-foreground">自動生成 Google 好評與管理客服知識庫</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <Button variant={activeTab === 'cs' ? 'default' : 'ghost'} onClick={() => setActiveTab('cs')}>客服助手 & 日誌</Button>
          <Button variant={activeTab === 'marketing' ? 'default' : 'ghost'} onClick={() => setActiveTab('marketing')}>Google 好評生成</Button>
        </div>
      </div>

      {activeTab === 'cs' ? (
        <div className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /> AI 客服日誌</CardTitle>
                <CardDescription>查看並修正客服回覆，持續訓練 AI 知識庫</CardDescription>
              </div>
              <Button variant="outline"><BookOpen className="w-4 h-4 mr-2" /> 知識庫管理 (Knowledge Base)</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {chatLogs.map(log => (
                  <div key={log.id} className="border p-4 rounded-lg bg-gray-50 flex justify-between items-start">
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-gray-700">Q: {log.user}</p>
                      <p className="text-sm text-blue-700">A: {log.ai}</p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`text-xs px-2 py-1 rounded-full ${log.status === '待修正' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {log.status}
                      </span>
                      <Button variant="ghost" size="sm" className="text-primary">修正答案</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> Google 好評生成器</CardTitle>
              <CardDescription>輸入產品名稱，AI 自動生成擬真的港式好評以供複製使用</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="輸入想推薦的產品（如：朱古力雞蛋仔）"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                />
                <Button onClick={handleGenerateReview}><Megaphone className="w-4 h-4 mr-2" /> 產生評價</Button>
              </div>

              {generatedReview && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-4">
                  <p className="text-gray-800">{generatedReview}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setGeneratedReview('')}>重新生成</Button>
                    <Button onClick={() => {
                      navigator.clipboard.writeText(generatedReview);
                      alert('已複製到剪貼簿，可前往 Google My Business 貼上！');
                    }}><Save className="w-4 h-4 mr-2" /> 複製評價</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
