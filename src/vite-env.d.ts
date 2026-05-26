/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_NVIDIA_NIM_API_KEY: string
  readonly VITE_NVIDIA_NIM_MODEL?: string
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_QWEN_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
