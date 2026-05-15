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
