/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';
  export function useRegisterSW(options?: {
    onRegisteredSW?: (swUrl: string, r: ServiceWorkerRegistration | undefined) => void;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisterError?: (error: Error) => void;
  }): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => void;
  };
}

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
