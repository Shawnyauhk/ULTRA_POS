import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Megaphone, MessageSquare, BookOpen, Star, Save, Loader2, AlertCircle } from 'lucide-react';
import { useReviews } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types';

// NVIDIA NIM API 配置
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b';
// 使用 Vite 代理繞過 CORS
const NVIDIA_API_URL = '/api/nvidia/v1/chat/completions';

// 好評生成 Prompt（加入隨機風格指示，確保每次不同）
const REVIEW_STYLES = [
  '朋友聚餐後寫的，語氣開心雀躍',
  '一個人路過試食，語氣真實自然',
  '同屋企人一齊食，語氣溫馨',
  '幫襯咗好多次嘅熟客，語氣親切',
  '第一次幫襯被驚艷到，語氣驚喜',
  '外賣自取嘅體驗，語氣實在',
];

// 調用 NVIDIA NIM API 生成好評（流式輸出）
async function generateReviewStreaming(
  productName: string,
  onToken: (token: string) => void
): Promise<string> {
  if (!NVIDIA_API_KEY) {
    throw new Error('未配置 NVIDIA NIM API Key');
  }

  const randomStyle = REVIEW_STYLES[Math.floor(Math.random() * REVIEW_STYLES.length)];

  // 精簡 prompt 以加速生成
  const prompt = `你是香港食客，用廣東話為「${productName}」寫一段好評。
情境：${randomStyle}
要求：粵語口語、描述味道口感、5星、30-80字、不用emoji。

直接回覆好評內容：`;

  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: '你是香港食客，用廣東話寫短評。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 128,
      temperature: 0.9,
      top_p: 0.95,
      stream: true  // 啟用流式輸出
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA NIM API 錯誤: ${response.status}`);
  }

  // 解析 SSE 流
  const reader = response.body?.getReader();
  if (!reader) throw new Error('無法讀取回應串流');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // 解析 SSE 事件（格式: data: {...}\n\n）
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          // Qwen 模型內容在 reasoning_content 或 content 字段
          const delta = parsed.choices?.[0]?.delta || {};
          const token = delta.reasoning_content || delta.content || '';
          if (token) {
            fullContent += token;
            onToken(fullContent);
          }
        } catch {
          // 跳過解析失敗的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!fullContent) throw new Error('AI 回覆為空');
  return fullContent;
}

export function AIChatPage() {
  const [activeTab, setActiveTab] = useState<'marketing' | 'cs'>('marketing');

  // AI Review States
  const [productName, setProductName] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');
  const [generatingReview, setGeneratingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const { reviews, createReview, refetch } = useReviews();

  // CS States
  const [chatLogs, setChatLogs] = useState<ChatMessage[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Fetch chat logs from Supabase
  useEffect(() => {
    const fetchChatLogs = async () => {
      setLoadingLogs(true);
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (!error && data) {
          setChatLogs(data);
        }
      } catch (err) {
        console.error('Error fetching chat logs:', err);
      } finally {
        setLoadingLogs(false);
      }
    };

    if (activeTab === 'cs') {
      fetchChatLogs();
    }
  }, [activeTab]);

  const handleGenerateReview = async () => {
    if (!productName) {
      setReviewError('請輸入產品名稱');
      return;
    }
    
    setReviewError(null);
    setGeneratedReview('');     // 清空之前的內容
    setGeneratingReview(true);
    
    try {
      // 流式生成：逐字顯示，500ms 內開始出現文字
      const review = await generateReviewStreaming(
        productName,
        (partialText) => setGeneratedReview(partialText)
      );
      
      // 生成完畢後保存到 Supabase（非同步，不影響展示）
      createReview({
        review_type: 'auto_generated',
        content: review,
        rating: 5,
        platform: 'google',
        status: 'draft'
      }).catch(err => console.warn('⚠️ 保存到數據庫失敗:', err));
      
    } catch (error) {
      console.error('❌ 生成好評失敗:', error);
      setReviewError(`生成失敗: ${error instanceof Error ? error.message : '請查看 Console'}`);
    } finally {
      setGeneratingReview(false);
    }
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
                {loadingLogs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : chatLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    暫無客服日誌，請先在 Supabase 執行遷移腳本
                  </div>
                ) : (
                  chatLogs.map(log => (
                    <div key={log.id} className="border p-4 rounded-lg bg-gray-50 flex justify-between items-start">
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-gray-700">Q: {log.role === 'user' ? log.content : ''}</p>
                        <p className="text-sm text-blue-700">A: {log.role === 'assistant' ? log.content : ''}</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          已記錄
                        </span>
                        <Button variant="ghost" size="sm" className="text-primary">修正答案</Button>
                      </div>
                    </div>
                  ))
                )}
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
                  disabled={generatingReview}
                />
                <Button onClick={handleGenerateReview} disabled={generatingReview || !productName}>
                  {generatingReview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
                  產生評價
                </Button>
              </div>

              {reviewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {reviewError}
                </div>
              )}

              {(generatingReview || generatedReview) && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-4 min-h-[100px]">
                  {generatedReview ? (
                    <>
                      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{generatedReview}</p>
                      {generatingReview && (
                        <span className="inline-block w-2 h-5 bg-yellow-600 animate-pulse ml-1 align-middle" />
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      <span>AI 正在生成...</span>
                    </div>
                  )}
                  {!generatingReview && generatedReview && (
                    <div className="flex justify-end gap-2 pt-2 border-t border-yellow-200">
                      <Button onClick={handleGenerateReview} variant="default" size="sm">
                        <Megaphone className="w-4 h-4 mr-2" />
                        重新生成
                      </Button>
                      <Button onClick={() => {
                        navigator.clipboard.writeText(generatedReview);
                        alert('已複製到剪貼簿，可前往 Google My Business 貼上！');
                      }} variant="outline" size="sm"><Save className="w-4 h-4 mr-2" /> 複製評價</Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
