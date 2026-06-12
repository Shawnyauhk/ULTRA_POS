import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProducts, useReviews, useSettings } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import type { Review } from '@/types';
import {
  Star, Megaphone, Loader2, Save, Settings, CheckCircle2,
  History, Edit3, Trash2, Brain, Copy, AlertCircle,
} from 'lucide-react';

const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b';
const NVIDIA_API_URL = '/api/nvidia/chat/completions';

const DEFAULT_CONFIG: ReviewConfig = {
  system_prompt: '你是香港食客，用廣東話寫短評。',
  rules: '粵語口語、描述味道口感、5星、30-80字、不用emoji',
  styles: [
    '朋友聚餐後寫的，語氣開心雀躍',
    '一個人路過試食，語氣真實自然',
    '同屋企人一齊食，語氣溫馨',
    '幫襯咗好多次嘅熟客，語氣親切',
    '第一次幫襯被驚艷到，語氣驚喜',
    '外賣自取嘅體驗，語氣實在',
  ],
  max_tokens: 128,
  temperature: 0.9,
};

interface ReviewConfig {
  system_prompt: string;
  rules: string;
  styles: string[];
  max_tokens: number;
  temperature: number;
}

function getRestaurantId(): string {
  const user = useAuthStore.getState().user;
  const rid = user?.restaurant_id || FALLBACK_RESTAURANT_ID;
  console.log('[Config] getRestaurantId:', rid, 'user:', user?.id || 'null');
  return rid;
}

function loadConfig(raw: string): ReviewConfig {
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function generateReviewStreaming(
  productName: string,
  config: ReviewConfig,
  onToken: (token: string) => void
): Promise<string> {
  if (!NVIDIA_API_KEY) {
    throw new Error('未配置 NVIDIA NIM API Key');
  }

  const randomStyle = config.styles[Math.floor(Math.random() * config.styles.length)];

  const prompt = `你是香港食客，用廣東話為「${productName}」寫一段好評。
情境：${randomStyle}
要求：${config.rules}

直接回覆好評內容：`;

  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: config.system_prompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: config.max_tokens,
      temperature: config.temperature,
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

// ========================
// 歷史記錄面板
// ========================
function ReviewHistoryPanel() {
  const { reviews, loading, updateReview, deleteReview, refetch, createReview } = useReviews();
  const { can } = usePermission();
  const canManage = can('review.manage') || can('setting.manage');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trainingInput, setTrainingInput] = useState('');
  const [trainingSaving, setTrainingSaving] = useState(false);

  const generatedReviews = reviews.filter(r => r.review_type === 'auto_generated');

  const handleAddTraining = async () => {
    if (!trainingInput.trim()) return;
    setTrainingSaving(true);
    try {
      const success = await createReview({
        review_type: 'manual',
        content: trainingInput.trim(),
        status: 'posted',
        for_training: true,
        platform: 'google',
        reviewed_at: new Date().toISOString(),
      });
      if (success) {
        setMsg({ type: 'success', text: '真實好評已儲存為訓練資料' });
        setTrainingInput('');
        refetch();
      } else {
        setMsg({ type: 'error', text: '儲存失敗' });
      }
    } catch {
      setMsg({ type: 'error', text: '儲存失敗' });
    } finally {
      setTrainingSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const handleStartEdit = (review: Review) => {
    setEditingId(review.id);
    setEditContent(review.edited_content || review.content);
  };

  const handleSaveEdit = async (review: Review) => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const success = await updateReview(review.id, {
        edited_content: editContent,
        status: 'posted',
        reviewed_at: new Date().toISOString(),
        for_training: true,
      });
      if (success) {
        setMsg({ type: 'success', text: '評價已審核並標記為訓練資料' });
        setEditingId(null);
        refetch();
      } else {
        setMsg({ type: 'error', text: '儲存失敗' });
      }
    } catch {
      setMsg({ type: 'error', text: '儲存失敗' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const handleToggleTraining = async (review: Review) => {
    const success = await updateReview(review.id, {
      for_training: !review.for_training,
      reviewed_at: !review.for_training ? new Date().toISOString() : undefined,
    });
    if (success) {
      setMsg({ type: 'success', text: !review.for_training ? '已標記為訓練資料' : '已取消訓練標記' });
      refetch();
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此評價？')) return;
    const success = await deleteReview(id);
    if (success) {
      setMsg({ type: 'success', text: '評價已刪除' });
      refetch();
    }
    setTimeout(() => setMsg(null), 3000);
  };

  if (loading) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              歷史評價記錄
            </CardTitle>
            <CardDescription>
              共 {generatedReviews.length} 條由 AI 生成的好評，可審核、修改、標記訓練資料
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <Loader2 className="w-4 h-4 mr-2" />刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && (
          <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
            msg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}

        {/* 輸入真實好評用作訓練 */}
        {canManage && (
          <div className="border-2 border-dashed border-purple-200 rounded-lg p-4 space-y-3 bg-purple-50/30">
            <div className="flex items-center gap-2 text-purple-800 font-medium text-sm">
              <Brain className="w-4 h-4" />
              輸入真實好評（訓練資料）
            </div>
            <Textarea
              value={trainingInput}
              onChange={(e) => setTrainingInput(e.target.value)}
              placeholder="請貼上或輸入真實顧客的好評內容..."
              className="min-h-[80px] bg-white"
            />
            <div className="flex justify-end">
              <Button onClick={handleAddTraining} disabled={trainingSaving || !trainingInput.trim()} size="sm">
                {trainingSaving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />儲存中...</>
                  : <><Save className="w-4 h-4 mr-2" />儲存為訓練資料</>}
              </Button>
            </div>
          </div>
        )}

        {generatedReviews.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            尚未產生任何好評
          </div>
        ) : (
          <div className="space-y-3">
            {generatedReviews.map((review) => {
              const isEditing = editingId === review.id;
              const displayContent = review.edited_content || review.content;

              return (
                <div key={review.id} className="border rounded-lg p-4 space-y-2 hover:border-gray-300 transition-colors">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{new Date(review.created_at).toLocaleString('zh-HK')}</span>
                      <span className={`px-2 py-0.5 rounded-full ${
                        review.status === 'posted' ? 'bg-green-100 text-green-700' :
                        review.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {review.status === 'posted' ? '已審核' : review.status === 'rejected' ? '已拒絕' : '待審核'}
                      </span>
                      {review.for_training && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                          <Brain className="w-3 h-3" />訓練資料
                        </span>
                      )}
                    </div>
                    <span className="capitalize text-gray-400">{review.platform}</span>
                  </div>

                  {/* Content */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[100px]"
                        placeholder="修改評價內容..."
                      />
                      {review.content !== editContent && (
                        <p className="text-xs text-amber-600">
                          修改後的內容將標記為訓練資料
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          取消
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(review)} disabled={saving}>
                          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                          審核並儲存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      {review.edited_content && review.edited_content !== review.content && (
                        <details className="text-xs text-gray-400">
                          <summary className="cursor-pointer hover:text-gray-600">查看原始 AI 內容</summary>
                          <p className="mt-1 p-2 bg-gray-50 rounded text-gray-500 italic">
                            {review.content}
                          </p>
                        </details>
                      )}
                    </>
                  )}

                  {/* Actions */}
                  {!isEditing && canManage && (
                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-100">
                      <Button variant="ghost" size="sm" onClick={() => handleStartEdit(review)}>
                        <Edit3 className="w-3.5 h-3.5 mr-1" />修改
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleTraining(review)}
                        className={review.for_training ? 'text-purple-600' : 'text-gray-500'}>
                        <Brain className="w-3.5 h-3.5 mr-1" />
                        {review.for_training ? '取消訓練' : '訓練資料'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        navigator.clipboard.writeText(displayContent);
                        alert('已複製到剪貼簿！');
                      }}>
                        <Copy className="w-3.5 h-3.5 mr-1" />複製
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(review.id)}
                        className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========================
// 生成規則設定面板
// ========================
function ConfigPanel({ config, setConfig, saving, onSave, onAddStyle, onRemoveStyle, newStyle, setNewStyle }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingValue(config.styles[idx]);
  };

  const confirmEdit = () => {
    const trimmed = editingValue.trim();
    if (editingIdx === null || !trimmed) return;
    setConfig(prev => ({
      ...prev,
      styles: prev.styles.map((s, i) => i === editingIdx ? trimmed : s)
    }));
    setEditingIdx(null);
    setEditingValue('');
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditingValue('');
  };

  return (
    <Card className="max-w-3xl border-orange-200">
      <CardHeader className="bg-orange-50 border-b border-orange-200">
        <CardTitle className="flex items-center gap-2 text-orange-800 text-lg">
          <Settings className="w-5 h-5" />
          好評生成規則設定
        </CardTitle>
        <CardDescription className="text-orange-600">
          修改後點擊「儲存設定」寫入資料庫
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div>
          <label className="text-sm font-medium mb-1 block text-gray-700">系統提示詞 (System Prompt)</label>
          <Textarea
            value={config.system_prompt}
            onChange={(e) => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
            placeholder="設定 AI 的角色..."
            className="min-h-[60px]"
          />
          <p className="text-xs text-gray-400 mt-1">定義 AI 的角色身份</p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block text-gray-700">生成規則</label>
          <Textarea
            value={config.rules}
            onChange={(e) => setConfig(prev => ({ ...prev, rules: e.target.value }))}
            placeholder="設定生成規則，用逗號分隔..."
            className="min-h-[60px]"
          />
          <p className="text-xs text-gray-400 mt-1">例如：粵語口語、描述味道口感、5星、30-80字、不用emoji</p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block text-gray-700">評價風格</label>
          <div className="space-y-2">
            {config.styles.map((style, i) => (
              editingIdx === i ? (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button size="sm" onClick={confirmEdit} disabled={!editingValue.trim()}>確定</Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit}>取消</Button>
                </div>
              ) : (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm px-3 py-1.5 bg-gray-50 border rounded-md">
                    {style}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(i)}
                    className="text-gray-400 hover:text-orange-600 shrink-0">
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemoveStyle(i)}
                    className="text-red-400 hover:text-red-600 shrink-0">✕</Button>
                </div>
              )
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newStyle}
              onChange={(e) => setNewStyle(e.target.value)}
              placeholder="新增風格..."
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddStyle(); } }}
            />
            <Button variant="outline" size="sm" onClick={onAddStyle} disabled={!newStyle.trim()}>新增</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block text-gray-700">
              Max Tokens <span className="text-gray-400 font-normal">({config.max_tokens})</span>
            </label>
            <input type="range" min={32} max={512} step={16}
              value={config.max_tokens}
              onChange={(e) => setConfig(prev => ({ ...prev, max_tokens: parseInt(e.target.value) }))}
              className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>32（短）</span><span>512（長）</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block text-gray-700">
              創意度 <span className="text-gray-400 font-normal">({config.temperature.toFixed(1)})</span>
            </label>
            <input type="range" min={0} max={200}
              value={Math.round(config.temperature * 100)}
              onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseInt(e.target.value) / 100 }))}
              className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0（保守）</span><span>2（創意）</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">修改後點擊按鈕儲存到資料庫</p>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />儲存中...</>
              : <><Save className="w-4 h-4 mr-2" />儲存設定</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========================
// 主頁面
// ========================
type TabType = 'generate' | 'history';

export default function ReviewGeneratorPage() {
  const { products, categories, loading: productsLoading } = useProducts();
  const { createReview } = useReviews();
  const { settings, loading: settingsLoading } = useSettings();
  const { can } = usePermission();

  const canManage = can('review.manage') || can('setting.manage');
  const configLoadedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabType>('generate');

  // Generator state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_CONFIG);
  const [newStyle, setNewStyle] = useState('');
  const [saving, setSaving] = useState(false);

  // 只加载一次配置（从 DB → state），之后 settings 变化不再覆盖本地修改
  useEffect(() => {
    console.log('[Config] Settings effect triggered:', {
      settingsLoading,
      settingsCount: settings.length,
      configLoaded: configLoadedRef.current
    });
    
    if (!settingsLoading && !configLoadedRef.current) {
      const currentRestaurantId = getRestaurantId();
      console.log('[Config] Looking for config with restaurant_id:', currentRestaurantId);
      
      const raw = settings.find(s => 
        s.setting_key === 'review_generator_config' && 
        s.restaurant_id === currentRestaurantId
      );
      
      if (raw) {
        console.log('[Config] Found config in DB, loading...');
        const loadedConfig = loadConfig(raw.setting_value);
        setConfig(loadedConfig);
        configLoadedRef.current = true;
        console.log('[Config] Config loaded successfully:', {
          system_prompt: loadedConfig.system_prompt?.substring(0, 50),
          stylesCount: loadedConfig.styles?.length
        });
      } else {
        console.log('[Config] No config found in DB, using defaults');
        // 沒有找到設定時也標記為已載入，避免重複嘗試
        // 這樣用戶可以繼續使用預設值並儲存新設定
        configLoadedRef.current = true;
      }
    }
  }, [settings, settingsLoading]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const currentRestaurantId = getRestaurantId();
      const configJson = JSON.stringify(config);
      
      console.log('[Config] Saving config...', {
        restaurant_id: currentRestaurantId,
        setting_key: 'review_generator_config',
        configSize: configJson.length,
        stylesCount: config.styles.length
      });

      const { data, error } = await supabase
        .from('settings')
        .upsert({
          restaurant_id: currentRestaurantId,
          setting_key: 'review_generator_config',
          setting_value: configJson,
          setting_type: 'json',
          description: 'Google 好評生成器設定（提示詞、規則、風格等）',
        }, { onConflict: 'restaurant_id, setting_key' })
        .select()
        .single();

      if (error) {
        console.error('[Config] Upsert error:', error);
        throw error;
      }

      console.log('[Config] Upsert success, returned data:', data);

      // 立即驗證：重新查詢確認資料真的寫入了
      const { data: verifyData, error: verifyError } = await supabase
        .from('settings')
        .select('*')
        .eq('restaurant_id', currentRestaurantId)
        .eq('setting_key', 'review_generator_config')
        .single();

      if (verifyError) {
        console.error('[Config] Verification query error:', verifyError);
        // 不拋出異常，因為寫入可能已成功，只是讀取失敗
      } else {
        console.log('[Config] Verification - DB value:', verifyData?.setting_value?.substring(0, 100));
        
        // 比較儲存的值和當前 config 是否一致
        try {
          const savedConfig = JSON.parse(verifyData?.setting_value || '{}');
          if (JSON.stringify(savedConfig) !== configJson) {
            console.warn('[Config] WARNING: Saved value differs from current config!');
          }
        } catch (e) {
          console.error('[Config] Failed to parse verification data:', e);
        }
      }

      showToast('success', '設定已儲存', 'Google 好評生成規則已更新至資料庫');
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[Config] Failed to save config:', err);
      showToast('error', '儲存失敗', msg);
    } finally {
      setSaving(false);
    }
  };

  const addStyle = () => {
    const trimmed = newStyle.trim();
    if (trimmed && !config.styles.includes(trimmed)) {
      setConfig(prev => ({ ...prev, styles: [...prev.styles, trimmed] }));
      setNewStyle('');
    }
  };

  const removeStyle = (index: number) => {
    setConfig(prev => ({ ...prev, styles: prev.styles.filter((_, i) => i !== index) }));
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : [];

  const handleGenerate = async () => {
    if (!selectedProduct) { setError('請選擇產品'); return; }
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    setError(null);
    setGeneratedReview('');
    setGenerating(true);

    try {
      const review = await generateReviewStreaming(
        product.name, config,
        (partialText) => setGeneratedReview(partialText)
      );
      createReview({
        review_type: 'auto_generated', content: review,
        rating: 5, platform: 'google', status: 'draft'
      }).catch(err => console.warn('保存到數據庫失敗:', err));
    } catch (err) {
      setError(`生成失敗: ${err instanceof Error ? err.message : '請查看 Console'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Google 好評生成器</h1>
          <p className="text-sm text-muted-foreground">選擇產品，AI 自動生成擬真港式好評</p>
        </div>
        {canManage && activeTab === 'generate' && (
          <Button variant="outline" onClick={() => setShowConfig(!showConfig)}>
            <Settings className="w-4 h-4 mr-2" />
            {showConfig ? '收起設定' : '生成規則'}
          </Button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button onClick={() => setActiveTab('generate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'generate'
              ? 'bg-white text-primary border border-b-white border-gray-200 -mb-[2px]'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}>
          <Star className="w-4 h-4" />生成好評
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-white text-primary border border-b-white border-gray-200 -mb-[2px]'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}>
          <History className="w-4 h-4" />歷史記錄
        </button>
      </div>

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <>
          {showConfig && canManage && (
            <ConfigPanel
              config={config} setConfig={setConfig}
              saving={saving}
              onSave={saveConfig}
              onAddStyle={addStyle} onRemoveStyle={removeStyle}
              newStyle={newStyle} setNewStyle={setNewStyle}
            />
          )}

          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" /> Google 好評生成
              </CardTitle>
              <CardDescription>先選分類，再選產品，AI 會自動生成好評</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">選擇分類</label>
                  <Select value={selectedCategory}
                    onValueChange={(v) => { setSelectedCategory(v); setSelectedProduct(''); }}
                    options={[
                      { value: '', label: '請選擇分類...' },
                      ...categories.map(c => ({ value: c.id, label: c.name }))
                    ]} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">選擇產品</label>
                  <Select value={selectedProduct}
                    onValueChange={setSelectedProduct}
                    disabled={!selectedCategory || productsLoading}
                    options={[
                      { value: '', label: '請選擇產品...' },
                      ...filteredProducts.map(p => ({ value: p.id, label: `${p.name} ($${p.price})` }))
                    ]} />
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={generating || !selectedProduct} className="w-full">
                {generating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                  : <><Megaphone className="w-4 h-4 mr-2" />產生好評</>}
              </Button>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}

              {(generating || generatedReview) && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-4 min-h-[100px]">
                  {generatedReview ? (
                    <>
                      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{generatedReview}</p>
                      {generating && <span className="inline-block w-2 h-5 bg-yellow-600 animate-pulse ml-1 align-middle" />}
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />AI 正在生成...
                    </div>
                  )}
                  {!generating && generatedReview && (
                    <div className="flex justify-end gap-2 pt-2 border-t border-yellow-200">
                      <Button onClick={handleGenerate} variant="default" size="sm">
                        <Megaphone className="w-4 h-4 mr-2" />重新生成
                      </Button>
                      <Button onClick={() => { navigator.clipboard.writeText(generatedReview); alert('已複製到剪貼簿！'); }}
                        variant="outline" size="sm">
                        <Save className="w-4 h-4 mr-2" />複製評價
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {products.length === 0 && !productsLoading && (
                <div className="text-center py-4 text-gray-400">
                  目前沒有產品資料，請先到產品管理頁面新增產品
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && <ReviewHistoryPanel />}
    </div>
  );
}
