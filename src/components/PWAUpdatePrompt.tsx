import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * PWA 自動更新提示
 * - 偵測到新版本 → 全螢幕提示 → 自動更新
 * - 員工無需手動操作，一鍵更新
 */
export default function PWAUpdatePrompt() {
  const [visible, setVisible] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // 註冊成功後定期檢查更新（每 5 分鐘）
    onRegisteredSW(swUrl, r) {
      if (r) {
        setInterval(async () => {
          await r.update();
        }, 5 * 60 * 1000);
      }
    },
    // 偵測到新版本
    onNeedRefresh() {
      setVisible(true);
    },
    // 註冊失敗（非 HTTPS 或 localhost 以外環境）
    onRegisterError(error) {
      console.log('SW registration skipped (dev/non-HTTPS):', error.message);
    },
  });

  // 關閉提示並強制更新
  const handleUpdate = () => {
    updateServiceWorker(true);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-8 mx-4 max-w-sm text-center shadow-2xl animate-in zoom-in-95 duration-300">
        {/* 圖示 */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">有新版本可用</h2>
        <p className="text-gray-400 text-sm mb-6">
          系統已更新，點擊下方按鈕立即重新載入最新版本
        </p>

        <button
          onClick={handleUpdate}
          className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors text-lg active:scale-95"
        >
          立即更新
        </button>

        <p className="text-gray-600 text-xs mt-4">
          頁面將自動重新整理，資料不會丟失
        </p>
      </div>
    </div>
  );
}
