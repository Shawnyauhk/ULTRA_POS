import { useState, useEffect } from 'react'
import { Download, X, Smartphone } from 'lucide-react'

// 偵測是否已安裝（standalone mode）
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true
}

// 偵測是否為 iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    && !(window as any).MSStream
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandalone()) return // 已安裝，不顯示

    // Android Chrome：攔截 beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS：沒有標準事件，直接顯示指引
    if (isIOS()) {
      // 延遲顯示，讓頁面先載入
      const timer = setTimeout(() => setShow(true), 2000)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    // Android Chrome 如果沒觸發 beforeinstallprompt（可能不符合條件），就不顯示
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setShow(false)
        setDeferredPrompt(null)
      }
    }
  }

  const handleDismiss = () => {
    setShow(false)
    setDismissed(true)
  }

  if (!show || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 max-w-md mx-auto">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-gray-100"
          aria-label="關閉"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-base mb-0.5">
              安裝「家傳芋曉 POS」
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              {deferredPrompt
                ? '一鍵安裝到手機，不用每次開瀏覽器'
                : '點分享按鈕 → 滑到「添加到主屏幕」'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white font-medium py-3 px-4 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
            >
              <Download className="w-5 h-5" />
              <span>安裝到主屏幕</span>
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong className="block mb-1">📱 iPhone 安裝步驟：</strong>
                1. 點下方中間的「分享」按鈕
                <span className="inline-block mx-1 text-base">📤</span>
                <br />
                2. 向下滑，點「添加到主屏幕」
                <span className="inline-block mx-1">➕</span>
                <br />
                3. 點右上角「新增」
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
