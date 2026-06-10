import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'

interface VersionInfo {
  version: string
  buildTime: string
}

/**
 * 版本检测组件：定期检查 version.json，发现新版本时提示刷新
 */
export function UpdatePrompt() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [newVersion, setNewVersion] = useState<string | null>(null)

  const checkVersion = useCallback(async () => {
    try {
      // 加时间戳防止缓存
      const res = await fetch(`/version.json?_t=${Date.now()}`)
      if (!res.ok) return
      const info: VersionInfo = await res.json()
      if (!currentVersion) {
        setCurrentVersion(info.version)
      } else if (info.version !== currentVersion) {
        setNewVersion(info.version)
      }
    } catch {
      // 静默失败
    }
  }, [currentVersion])

  useEffect(() => {
    // 首次检查
    checkVersion()
    // 每 5 分钟检查一次
    const timer = setInterval(checkVersion, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [checkVersion])

  // 页面可见时额外检查一次
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkVersion])

  if (!newVersion) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
      <div className="flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-blue-600/30">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin-slow" />
        <div className="text-sm">
          <p className="font-medium">有新版本可用</p>
          <p className="text-blue-100 text-xs mt-0.5">點擊立即更新至最新功能</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="ml-2 bg-white text-blue-600 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors shrink-0"
        >
          更新
        </button>
        <button
          onClick={() => setNewVersion(null)}
          className="text-blue-200 hover:text-white transition-colors shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
