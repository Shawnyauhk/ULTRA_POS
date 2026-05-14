import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Star, Megaphone, Loader2, Save } from 'lucide-react';
import { useProducts, useReviews } from '@/hooks/useSupabaseData';

const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b';
const NVIDIA_API_URL = '/api/nvidia/v1/chat/completions';

const REVIEW_STYLES = [
  '朋友聚餐後寫的，語氣開心雀躍',
  '一個人路過試食，語氣真實自然',
  '同屋企人一齊食，語氣溫馨',
  '幫襯咗好多次嘅熟客，語氣親切',
  '第一次幫襯被驚艷到，語氣驚喜',
  '外賣自取嘅體驗，語氣實在',
];

async function generateReviewStreaming(
  productName: string,
  onToken: (token: string) => void
): Promise<string> {
  if (!NVIDIA_API_KEY) {
    throw new Error('未配置 NVIDIA NIM API Key');
  }

  const randomStyle = REVIEW_STYLES[Math.floor(Math.random() * REVIEW_STYLES.length)];

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
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`NVIDIA NIM API 錯誤: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('無法讀取回應串流');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta || {};
        const token = delta.reasoning_content || delta.content || '';
        if (token) {
          fullContent += token;
          onToken(fullContent);
        }
      } catch {}
    }
  }

  if (!fullContent) throw new Error('AI 回覆為空');
  return fullContent;
}

export default function ReviewGeneratorPage() {
  const { products, categories, loading: productsLoading } = useProducts();
  const { createReview } = useReviews();

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : [];

  const handleGenerate = async () => {
    if (!selectedProduct) {
      setError('請選擇產品');
      return;
    }
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    setError(null);
    setGeneratedReview('');
    setGenerating(true);

    try {
      const review = await generateReviewStreaming(
        product.name,
        (partialText) => setGeneratedReview(partialText)
      );

      createReview({
        review_type: 'auto_generated',
        content: review,
        rating: 5,
        platform: 'google',
        status: 'draft'
      }).catch(err => console.warn('保存到數據庫失敗:', err));
    } catch (err) {
      setError(`生成失敗: ${err instanceof Error ? err.message : '請查看 Console'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Google 好評生成器</h1>
        <p className="text-muted-foreground">選擇產品，AI 自動生成擬真港式好評</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" /> Google 好評生成
          </CardTitle>
          <CardDescription>
            先選分類，再選產品，AI 會自動生成好評
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 分類選擇 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">選擇分類</label>
              <Select
                value={selectedCategory}
                onValueChange={(v) => { setSelectedCategory(v); setSelectedProduct(''); }}
                options={[
                  { value: '', label: '請選擇分類...' },
                  ...categories.map(c => ({ value: c.id, label: c.name }))
                ]}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">選擇產品</label>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
                disabled={!selectedCategory || productsLoading}
                options={[
                  { value: '', label: '請選擇產品...' },
                  ...filteredProducts.map(p => ({ value: p.id, label: `${p.name} ($${p.price})` }))
                ]}
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedProduct}
            className="w-full"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <><Megaphone className="w-4 h-4 mr-2" />產生好評</>
            )}
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {(generating || generatedReview) && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-4 min-h-[100px]">
              {generatedReview ? (
                <>
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{generatedReview}</p>
                  {generating && (
                    <span className="inline-block w-2 h-5 bg-yellow-600 animate-pulse ml-1 align-middle" />
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span>AI 正在生成...</span>
                </div>
              )}
              {!generating && generatedReview && (
                <div className="flex justify-end gap-2 pt-2 border-t border-yellow-200">
                  <Button onClick={handleGenerate} variant="default" size="sm">
                    <Megaphone className="w-4 h-4 mr-2" />重新生成
                  </Button>
                  <Button onClick={() => {
                    navigator.clipboard.writeText(generatedReview);
                    alert('已複製到剪貼簿！');
                  }} variant="outline" size="sm">
                    <Save className="w-4 h-4 mr-2" />複製評價
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 產品數量太少提示 */}
          {products.length === 0 && !productsLoading && (
            <div className="text-center py-4 text-gray-400">
              目前沒有產品資料，請先到產品管理頁面新增產品
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
