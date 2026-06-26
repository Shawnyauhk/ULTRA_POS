/**
 * AI 分析提供者配置
 * 只需更改 AI_PROVIDER 和相關配置即可切換不同的 AI 服務
 */

export type AIProvider = 'gemini' | 'qwen' | 'nvidia' | 'agnes';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
}

export interface SalesData {
  dailySales: Array<{ date: string; amount: number }>;
  categorySales: Array<{ category: string; amount: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
}

export interface AIAnalysisResult {
  insights: string[];
  recommendations: string[];
  peakHours: string[];
  provider: AIProvider;
}

// ================ 配置區域（只需修改這裡） ================

// 選擇 AI 分析提供者: 'gemini' | 'qwen' | 'nvidia' | 'agnes'
const CURRENT_PROVIDER: AIProvider = 'agnes';

// NVIDIA NIM 配置 (推薦 - 免費額度)
const NVIDIA_CONFIG: AIConfig = {
  provider: 'nvidia',
  apiKey: import.meta.env.VITE_NVIDIA_NIM_API_KEY || '',
  model: import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
  apiUrl: '/api/nvidia/v1/chat/completions',  // 使用 Vite 代理繞過 CORS
};

// Google Gemini 配置
const GEMINI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  model: 'gemini-2.0-flash',
  apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
};

// Qwen (阿里雲) 配置
const QWEN_CONFIG: AIConfig = {
  provider: 'qwen',
  apiKey: import.meta.env.VITE_QWEN_API_KEY || '',
  model: 'qwen-plus',  // 或 'qwen-max', 'qwen-turbo'
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
};

// Agnes AI 配置 (無限期免費，OpenAI 兼容格式)
const AGNES_CONFIG: AIConfig = {
  provider: 'agnes',
  apiKey: import.meta.env.VITE_AGNES_API_KEY || '',
  model: 'agnes-2.0-flash',
  apiUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
};

// 分析 Prompt
const ANALYSIS_PROMPT = `你是一個餐廳經營顧問。請分析以下銷售數據，提供建議：

{context}

請提供：
1. 關鍵洞察 (insights) - 3-5條
2. 經營建議 (recommendations) - 3-5條
3. 建議的繁忙時段 (peakHours) - 列出時段如 ["12:00-14:00", "18:00-20:00"]

請以 JSON 格式回覆：
{
  "insights": ["洞察1", "洞察2", ...],
  "recommendations": ["建議1", "建議2", ...],
  "peakHours": ["時段1", "時段2", ...]
}

只回覆 JSON，不要有其他文字。`;

// ================ 底層實現 ================

// Google Gemini 分析
async function geminiAnalysis(salesData: SalesData): Promise<AIAnalysisResult> {
  const context = `銷售數據：
${JSON.stringify(salesData, null, 2)}`;
  
  const response = await fetch(`${GEMINI_CONFIG.apiUrl}?key=${GEMINI_CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: ANALYSIS_PROMPT.replace('{context}', context) }]
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API 錯誤: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return parseAnalysisResult(text, 'gemini');
}

// Qwen 分析
async function qwenAnalysis(salesData: SalesData): Promise<AIAnalysisResult> {
  const context = `銷售數據：
${JSON.stringify(salesData, null, 2)}`;
  
  const response = await fetch(QWEN_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: QWEN_CONFIG.model,
      input: {
        messages: [
          {
            role: 'system',
            content: '你是一個專業的餐廳經營顧問。'
          },
          {
            role: 'user',
            content: ANALYSIS_PROMPT.replace('{context}', context)
          }
        ]
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Qwen API 錯誤: ${response.status}`);
  }

  const data = await response.json();
  const text = data.output?.choices?.[0]?.message?.content || '';
  
  return parseAnalysisResult(text, 'qwen');
}

// NVIDIA NIM 分析 (使用 qwen/qwen3.5-122b-a10b)
async function nvidiaAnalysis(salesData: SalesData): Promise<AIAnalysisResult> {
  const context = `銷售數據：
${JSON.stringify(salesData, null, 2)}`;
  
  const response = await fetch(NVIDIA_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_CONFIG.model,
      messages: [
        {
          role: 'system',
          content: '你是一個專業的餐廳經營顧問。請用繁體中文回覆。'
        },
        {
          role: 'user',
          content: ANALYSIS_PROMPT.replace('{context}', context)
        }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA NIM API 錯誤: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // NVIDIA NIM Qwen 模型返回的內容在 reasoning_content 字段
  const text = 
    data.choices?.[0]?.message?.reasoning_content ||
    data.choices?.[0]?.message?.content ||
    '';
  
  return parseAnalysisResult(text, 'nvidia');
}

// Agnes AI 分析
async function agnesAnalysis(salesData: SalesData): Promise<AIAnalysisResult> {
  const context = `銷售數據：
${JSON.stringify(salesData, null, 2)}`;
  
  const response = await fetch(AGNES_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGNES_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: AGNES_CONFIG.model,
      messages: [
        {
          role: 'system',
          content: '你是一個專業的餐廳經營顧問。請用繁體中文回覆。'
        },
        {
          role: 'user',
          content: ANALYSIS_PROMPT.replace('{context}', context)
        }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Agnes AI API 錯誤: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  
  return parseAnalysisResult(text, 'agnes');
}

// 解析分析結果
function parseAnalysisResult(text: string, provider: AIProvider): AIAnalysisResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const result = JSON.parse(jsonMatch[0]);
      return {
        insights: result.insights || [],
        recommendations: result.recommendations || [],
        peakHours: result.peakHours || [],
        provider,
      };
    } catch {
      // JSON 解析失敗
    }
  }
  
  return {
    insights: ['暫時無法分析數據'],
    recommendations: ['請稍後再試'],
    peakHours: [],
    provider,
  };
}

// ================ 統一接口 ================

/**
 * 使用當前配置的 AI 分析銷售數據
 */
export async function analyzeSalesWithAI(salesData: SalesData): Promise<AIAnalysisResult> {
  switch (CURRENT_PROVIDER) {
    case 'agnes':
      return agnesAnalysis(salesData);
    case 'nvidia':
      return nvidiaAnalysis(salesData);
    case 'gemini':
      return geminiAnalysis(salesData);
    case 'qwen':
      return qwenAnalysis(salesData);
    default:
      throw new Error(`未知的 AI 提供者: ${CURRENT_PROVIDER}`);
  }
}

/**
 * 獲取當前 AI 配置信息
 */
export function getAIConfig() {
  switch (CURRENT_PROVIDER) {
    case 'agnes':
      return AGNES_CONFIG;
    case 'nvidia':
      return NVIDIA_CONFIG;
    case 'gemini':
      return GEMINI_CONFIG;
    case 'qwen':
      return QWEN_CONFIG;
    default:
      return null;
  }
}

/**
 * 獲取所有可用 AI 提供商列表
 */
export function getAvailableProviders(): { id: AIProvider; name: string }[] {
  return [
    { id: 'agnes', name: 'Agnes AI (agnes-2.0-flash)' },
    { id: 'nvidia', name: 'NVIDIA NIM (qwen3.5-122b)' },
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'qwen', name: '阿里雲通義千問' },
  ];
}
