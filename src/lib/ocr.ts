/**
 * AI OCR 提供者配置
 * 只需更改 OCR_PROVIDER 和相關配置即可切換不同的 AI 服務
 */

export type OCRProvider = 'gemini' | 'qwen' | 'nvidia' | 'agnes';

export interface OCRConfig {
  provider: OCRProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
}

// ================ 配置區域（只需修改這裡） ================

// 選擇 OCR 提供者: 'gemini' | 'qwen' | 'nvidia' | 'agnes'
const CURRENT_PROVIDER: OCRProvider = 'agnes';

// NVIDIA NIM 配置 (推薦 - 免費額度)
// API Key: https://build.nvidia.com/nim
const NVIDIA_CONFIG: OCRConfig = {
  provider: 'nvidia',
  apiKey: import.meta.env.VITE_NVIDIA_NIM_API_KEY || '',
  model: import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
  apiUrl: '/api/nvidia/v1/chat/completions',  // 使用 Vite 代理繞過 CORS
};

// Google Gemini 配置
const GEMINI_CONFIG: OCRConfig = {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  model: 'gemini-2.5-flash-lite',
  apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
};

// Qwen (阿里雲) 配置
// 申請地址: https://dashscope.console.aliyun.com/
const QWEN_CONFIG: OCRConfig = {
  provider: 'qwen',
  apiKey: import.meta.env.VITE_QWEN_API_KEY || '',
  model: 'qwen-vl-max',  // 或 'qwen-vl-plus', 'qwen-vl-flash'
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
};

// Agnes AI 配置 (無限期免費，OpenAI 兼容格式)
// 註冊: https://agnes-ai.com/
const AGNES_CONFIG: OCRConfig = {
  provider: 'agnes',
  apiKey: import.meta.env.VITE_AGNES_API_KEY || '',
  model: 'agnes-2.0-flash',
  apiUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
};

// 收據模式 Prompt（匹配 server.js 詳細提示）
const RECEIPT_PROMPT = `你是收據/帳單精確 OCR 辨識專家。逐字仔細閱讀這張圖片中的**每個中文字元**，特別留意小字和模糊的字跡。

【重要辨識規則】
- 圖片可能經過壓縮或光線不均，請根據上下文**推測**不清晰的字元
- 注意中文字形相似易混淆的字（如「巳/已/己」、「午/牛」、「未/末」、「士/土」、「日/曰」）
- 金額數字要注意小數點位置（$10.50 ≠ $1050）
- 日期要注意年月日的數字順序

【折扣處理 - 非常重要！】
- 如果有「折扣」「減免」「優惠」「會員折」「全場折」等欄位，必須先識別折扣金額
- 最終入帳金額必須是折扣後的「應付金額」「實付金額」「需付」「合計」，不是原價
- 範例：原價 $155.20，折扣 -$31.00，則總價 = $124.20（不是 $155.20）

【必輸欄位】
1. 日期: YYYY-MM-DD（帳單日期）
2. 供應商: XXX（從帳單抬頭/標誌識別真正的供應商）
3. 分類: XXX（電費/水費/煤氣費/租金/進貨成本/薪金/雜項）
4. 品項: 品名1 $價格1, 品名2 $價格2, ...
5. 總價: $總金額（必須為折扣後的應付金額）
6. 折扣: $-折扣金額（如有折扣則輸出；無則不輸出）

【可選欄位】
7. 發票: 編號（如有）

重要規則：
- 每個欄位獨立一行，以「欄位名:」開頭
- 只輸出以上欄位，不要任何其他文字或 markdown 格式

範例輸出1（進貨收據無折扣）：
日期: 2026-05-18
供應商: 炳記行
分類: 進貨成本
發票: INV-20260518
品項: 蛋 $270, 淡忌廉 $630, 椰漿 $280
總價: $1180

範例輸出2（有折扣的收據）：
日期: 2026-06-25
供應商: 永南食品
分類: 進貨成本
發票: INV-20260625
品項: 椰漿 $100, 西米 $31, 芒果 $55, 糯米粉 $37
總價: $124.20
折扣: $-31.00`;

// 手寫記賬本模式 Prompt（匹配 server.js 詳細提示）
const HANDWRITTEN_PROMPT = `你是餐廳記賬本精確辨識助手。分析這張手寫記賬本圖片，**仔細查看每一個欄位**，提取每一筆支出記錄。

重要：每筆支出的日期可能不同（一頁記賬本包含多天的記錄），必須為每個項目提取對應的日期。

要求：
1. **每行嚴格格式**：日期: YYYY-MM-DD, 項目: XXX, 支出: $金額
2. **提取所有項目**：仔細查看圖片中每一個條目，不要遺漏任何一筆。同一天的項目必須逐一分開列出。圖片中通常有10-30筆支出。
3. 日期欄位是「日/月」格式（如 8/4 = 4月8日）。請轉換為 YYYY-MM-DD 格式：8/4->2026-04-08
4. **同一天的不同品項要分開列為多行**，共用同一個日期
5. 如只有日期和金額，無描述項目，則項目留空：日期: 2026-04-08, 項目: , 支出: $26
6. 所有支出金額以 $ 前綴
7. 不要輸出收入或結餘欄位的內容，只輸出支出記錄
8. 每筆一行，最後輸出：總支出: $總金額
9. **只回覆以下格式，不要其他文字**

範例輸出：
日期: 2026-04-08, 項目: 快遞費, 支出: $26
日期: 2026-04-08, 項目: 菜，洋葱, 支出: $48
日期: 2026-04-08, 項目: 紅豆, 支出: $38
日期: 2026-04-09, 項目: 燒賣, 支出: $26
日期: 2026-04-09, 項目: 芋圓, 支出: $50
日期: 2026-04-10, 項目: 餐巾紙, 支出: $100
日期: 2026-04-10, 項目: 糯米粉, 支出: $83
日期: 2026-04-10, 項目: 糖, 支出: $170
日期: 2026-04-10, 項目: 油, 支出: $165
總支出: $706`;

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

// Google Gemini OCR（支援自訂提示，用於收據/手寫模式切換）
async function geminiOCR(imageBase64: string, customPrompt?: string): Promise<OCRResult> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const prompt = customPrompt || RECEIPT_PROMPT;
  
  const response = await fetch(`${GEMINI_CONFIG.apiUrl}?key=${GEMINI_CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
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

// NVIDIA NIM OCR (使用 qwen/qwen3.5-122b-a10b 多模態模型)
async function nvidiaOCR(imageBase64: string): Promise<OCRResult> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  // NVIDIA NIM 使用 OpenAI 兼容 API 格式
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
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`
              }
            },
            {
              type: 'text',
              text: OCR_PROMPT
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1
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
  
  return parseOCRResult(text, 'nvidia');
}

// Agnes AI OCR (agnes-2.0-flash 多模態模型，OpenAI 兼容格式)
async function agnesOCR(imageBase64: string, mode: 'receipt' | 'handwritten'): Promise<OCRResult> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const prompt = mode === 'handwritten' ? HANDWRITTEN_PROMPT : RECEIPT_PROMPT;

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
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Agnes AI API 錯誤: ${response.status} - ${errorText.slice(0, 100)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return parseOCRResult(text, 'agnes');
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
 * @param imageBase64 圖片的 base64 字串
 * @param mode 'receipt' = 收據模式, 'handwritten' = 手寫記賬本模式
 */
export async function recognizeReceipt(imageBase64: string, mode: 'receipt' | 'handwritten' = 'receipt'): Promise<OCRResult> {
  switch (CURRENT_PROVIDER) {
    case 'nvidia':
      return nvidiaOCR(imageBase64);
    case 'gemini':
      return geminiOCR(imageBase64, mode === 'handwritten' ? HANDWRITTEN_PROMPT : RECEIPT_PROMPT);
    case 'qwen':
      return qwenOCR(imageBase64);
    case 'agnes':
      return agnesOCR(imageBase64, mode);
    default:
      throw new Error(`未知的 OCR 提供者: ${CURRENT_PROVIDER}`);
  }
}

/**
 * 獲取當前 OCR 配置信息
 */
export function getOCRConfig() {
  switch (CURRENT_PROVIDER) {
    case 'nvidia':
      return NVIDIA_CONFIG;
    case 'gemini':
      return GEMINI_CONFIG;
    case 'qwen':
      return QWEN_CONFIG;
    case 'agnes':
      return AGNES_CONFIG;
    default:
      return null;
  }
}

/**
 * 切換 OCR 提供者（運行時切換）
 */
export function setOCRProvider(provider: OCRProvider) {
  if (provider === 'nvidia') {
    return NVIDIA_CONFIG;
  } else if (provider === 'gemini') {
    return GEMINI_CONFIG;
  } else if (provider === 'qwen') {
    return QWEN_CONFIG;
  } else if (provider === 'agnes') {
    return AGNES_CONFIG;
  }
  throw new Error(`未知的 OCR 提供者: ${provider}`);
}

/**
 * 獲取所有可用提供商列表
 */
export function getAvailableProviders(): { id: OCRProvider; name: string }[] {
  return [
    { id: 'agnes', name: 'Agnes AI (agnes-2.0-flash)' },
    { id: 'gemini', name: 'Google Gemini Vision' },
    { id: 'qwen', name: '阿里雲通義千問' },
    { id: 'nvidia', name: 'NVIDIA NIM (qwen3.5-122b)' },
  ];
}
