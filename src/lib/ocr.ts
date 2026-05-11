/**
 * AI OCR 提供者配置
 * 只需更改 OCR_PROVIDER 和相關配置即可切換不同的 AI 服務
 */

export type OCRProvider = 'gemini' | 'qwen';

export interface OCRConfig {
  provider: OCRProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
}

// ================ 配置區域（只需修改這裡） ================

// 選擇 OCR 提供者: 'gemini' | 'qwen'
const CURRENT_PROVIDER: OCRProvider = 'gemini';

// Google Gemini 配置
const GEMINI_CONFIG: OCRConfig = {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  model: 'gemini-2.0-flash',
  apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
};

// Qwen (阿里雲) 配置
// 申請地址: https://dashscope.console.aliyun.com/
const QWEN_CONFIG: OCRConfig = {
  provider: 'qwen',
  apiKey: import.meta.env.VITE_QWEN_API_KEY || '',
  model: 'qwen-vl-max',  // 或 'qwen-vl-plus', 'qwen-vl-flash'
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
};

// 通用的 OCR Prompt（適用於所有提供者）
const OCR_PROMPT = `你是一個收據識別助手。請分析這張收據圖片，提取以下信息：
1. 總金額 (amount)
2. 日期 (date，格式 YYYY-MM-DD)
3. 商戶名稱 (merchant)
4. 商品項目列表 (items)

請以 JSON 格式回覆，格式如下：
{
  "amount": 數字或null,
  "date": "日期字串或null",
  "merchant": "商戶名稱或null",
  "items": ["商品1", "商品2"],
  "confidence": 0-1之間的數字
}

只回覆 JSON，不要有其他文字。`;

// ================ 底層實現 ================

export interface OCRResult {
  amount: number | null;
  date: string | null;
  merchant: string | null;
  items: string[];
  rawText: string;
  confidence: number;
  provider: OCRProvider;
}

// Google Gemini OCR
async function geminiOCR(imageBase64: string): Promise<OCRResult> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const response = await fetch(`${GEMINI_CONFIG.apiUrl}?key=${GEMINI_CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: OCR_PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API 錯誤: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return parseOCRResult(text, 'gemini');
}

// Qwen OCR
async function qwenOCR(imageBase64: string): Promise<OCRResult> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
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
            role: 'user',
            content: [
              { image: `data:image/jpeg;base64,${base64Data}` },
              { text: OCR_PROMPT }
            ]
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
  
  return parseOCRResult(text, 'qwen');
}

// 解析 OCR 結果
function parseOCRResult(text: string, provider: OCRProvider): OCRResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const result = JSON.parse(jsonMatch[0]);
      return {
        amount: result.amount ? parseFloat(result.amount) : null,
        date: result.date || null,
        merchant: result.merchant || null,
        items: result.items || [],
        rawText: text,
        confidence: result.confidence || 0.5,
        provider,
      };
    } catch {
      // JSON 解析失敗
    }
  }
  
  return {
    amount: null,
    date: null,
    merchant: null,
    items: [],
    rawText: text,
    confidence: 0,
    provider,
  };
}

// ================ 統一接口 ================

/**
 * 使用當前配置的 OCR 提供者識別收據
 */
export async function recognizeReceipt(imageBase64: string): Promise<OCRResult> {
  switch (CURRENT_PROVIDER) {
    case 'gemini':
      return geminiOCR(imageBase64);
    case 'qwen':
      return qwenOCR(imageBase64);
    default:
      throw new Error(`未知的 OCR 提供者: ${CURRENT_PROVIDER}`);
  }
}

/**
 * 獲取當前 OCR 配置信息
 */
export function getOCRConfig() {
  switch (CURRENT_PROVIDER) {
    case 'gemini':
      return GEMINI_CONFIG;
    case 'qwen':
      return QWEN_CONFIG;
    default:
      return null;
  }
}

/**
 * 切換 OCR 提供者（運行時切換）
 */
export function setOCRProvider(provider: OCRProvider) {
  if (provider === 'gemini') {
    return GEMINI_CONFIG;
  } else if (provider === 'qwen') {
    return QWEN_CONFIG;
  }
  throw new Error(`未知的 OCR 提供者: ${provider}`);
}

/**
 * 獲取所有可用提供商列表
 */
export function getAvailableProviders(): { id: OCRProvider; name: string }[] {
  return [
    { id: 'gemini', name: 'Google Gemini Vision' },
    { id: 'qwen', name: '阿里雲通義千問' },
  ];
}
