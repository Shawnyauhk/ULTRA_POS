import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * 检查 Supabase 凭据是否已配置
 * 所有依赖 Supabase 的操作应在执行前调用此函数
 * 预览环境缺少 .env 是常见问题，本函数提供清晰提示
 */
export function checkSupabaseReady(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      '[Supabase] 請檢查 .env 檔案:\n' +
      '  VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 必須設定\n' +
      '  請複製 .env.example 為 .env 並填入有效的 Supabase 憑證'
    )
    return false
  }
  return true
}

/**
 * 获取 Supabase 错误的人类可读信息
 */
export function getSupabaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    if (e.message) return String(e.message)
    if (e.code) return `錯誤代碼: ${e.code}`
    if (e.details) return String(e.details)
  }
  return '資料庫連線失敗，請檢查網路或 .env 設定'
}

/**
 * 發送帶有 Auth Token 的 API 請求
 * 所有後端 API 調用應使用此函數而非直接 fetch
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // 獲取當前的 Supabase session token
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  // 如果有 token 則帶上 Authorization header
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    ...options,
    headers,
  })

  // Render 免費版容器閒置 15 分鐘後會休眠，冷啟動時第一個請求可能
  // 返回 HTML 錯誤頁（<!DOCTYPE ...）。預先檢測 content-type，
  // 讓上游能給出可讀訊息，避免 "Unexpected token '<'" 之類的 JSON 解析錯誤。
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    // 拋出一個帶有友好訊息的錯誤
    const text = await res.clone().text().catch(() => '')
    const preview = text ? text.substring(0, 120) : ''
    const err: any = new Error(
      res.status === 502 || res.status === 503 || res.status === 504
        ? `後端服務正在冷啟動中 (HTTP ${res.status})，請稍候再試`
        : `後端返回非 JSON 響應 (HTTP ${res.status}, ${ct || 'no content-type'})`
    )
    err.status = res.status
    err.contentType = ct
    err.body = preview
    err.isColdStart = res.status === 502 || res.status === 503 || res.status === 504
    throw err
  }

  return res
}
