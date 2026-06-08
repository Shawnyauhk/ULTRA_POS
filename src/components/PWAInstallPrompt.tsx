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
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 leading-relaxed text-center font-medium mb-2">
                  ⚠️ iPhone 無法一鍵安裝，但只要做一次就不需要了
                </p>
                <div className="flex items-center justify-center gap-4 py-1">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-600 mb-1">1</div>
                    <span className="text-[10px] text-gray-500">點分享</span>
                    <span className="text-lg">📤</span>
                  </div>
                  <div className="text-amber-300 text-lg">→</div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-600 mb-1">2</div>
                    <span className="text-[10px] text-gray-500">滑到底</span>
                    <span className="text-lg">➕</span>
                  </div>
                  <div className="text-amber-300 text-lg">→</div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-600 mb-1">3</div>
                    <span className="text-[10px] text-gray-500">按新增</span>
                    <span className="text-lg">✅</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 text-center">
                💡 先找年輕人幫忙裝一次，之後都不用再設定了
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
