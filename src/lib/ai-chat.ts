/**
 * AI 客服聊天客戶端
 * 透過 Server API 處理（包含知識庫查詢 + 儲存對話紀錄）
 */

const AI_API_URL = '/api/nvidia/v1/chat/completions';

export interface ChatRequest {
  message: string;
  sessionId: string;
  restaurantId: string;
  customerName?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatResponse {
  success: boolean;
  reply: string;
  sessionId: string;
}

/**
 * 發送訊息到 AI 客服並取得回覆
 * 透過 Server API 處理（包含知識庫查詢 + 儲存對話紀錄）
 */
export async function sendAIChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI 客服錯誤: ${error}`);
  }

  return response.json();
}

/**
 * 獲取會話列表（管理後台用）
 */
export async function fetchSessions(restaurantId: string) {
  const response = await fetch(`/api/ai/sessions?restaurant_id=${restaurantId}`);
  if (!response.ok) throw new Error('獲取會話列表失敗');
  return response.json();
}

/**
 * 獲取單個會話的詳細訊息
 */
export async function fetchSessionMessages(sessionId: string) {
  const response = await fetch(`/api/ai/sessions/${sessionId}/messages`);
  if (!response.ok) throw new Error('獲取會話訊息失敗');
  return response.json();
}

/**
 * 關閉會話
 */
export async function closeSession(sessionId: string) {
  const response = await fetch(`/api/ai/sessions/${sessionId}/close`, { method: 'POST' });
  if (!response.ok) throw new Error('關閉會話失敗');
  return response.json();
}

/**
 * 刪除會話（連同所有訊息）
 */
export async function deleteSession(sessionId: string) {
  const response = await fetch(`/api/ai/sessions/${sessionId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('刪除會話失敗');
  return response.json();
}

/**
 * 獲取知識庫列表
 */
export async function fetchKnowledgeBase(restaurantId: string) {
  const response = await fetch(`/api/ai/knowledge?restaurant_id=${restaurantId}`);
  if (!response.ok) throw new Error('獲取知識庫失敗');
  return response.json();
}

/**
 * 新增/更新知識庫條目
 */
export async function saveKnowledgeEntry(entry: {
  id?: string;
  restaurant_id: string;
  category: string;
  question: string;
  answer: string;
}) {
  const method = entry.id ? 'PUT' : 'POST';
  const response = await fetch('/api/ai/knowledge', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw new Error('儲存知識庫失敗');
  return response.json();
}

/**
 * 刪除知識庫條目
 */
export async function deleteKnowledgeEntry(id: string) {
  const response = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('刪除知識庫失敗');
  return response.json();
}

/**
 * 獲取 AI 配置
 */
export async function fetchAIConfig(restaurantId: string) {
  const response = await fetch(`/api/ai/config?restaurant_id=${restaurantId}`);
  if (!response.ok) throw new Error('獲取 AI 配置失敗');
  return response.json();
}

/**
 * 更新 AI 配置
 */
export async function updateAIConfig(restaurantId: string, configKey: string, configValue: Record<string, unknown>) {
  const response = await fetch('/api/ai/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant_id: restaurantId, config_key: configKey, config_value: configValue }),
  });
  if (!response.ok) throw new Error('更新 AI 配置失敗');
  return response.json();
}

// =========== 對話建議 API ===========

export interface SubmitSuggestionParams {
  restaurant_id: string;
  session_id: string;
  message_id: string;
  role: 'user' | 'assistant';
  original_question: string;
  original_answer: string;
  suggested_answer: string;
  notes?: string;
}

/**
 * 提交對話修正建議（自動同步到知識庫）
 */
export async function submitSuggestion(params: SubmitSuggestionParams) {
  const response = await fetch('/api/ai/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error('提交建議失敗');
  return response.json();
}
