import { useState, useRef, useEffect } from 'react';
import { LogOut, KeyRound, User, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';

const roleLabels: Record<string, string> = {
  owner: '店主', manager: '主管', staff: '員工',
};

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changing, setChanging] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    logout();
  };

  const handleChangePwd = async () => {
    setPwdError('');
    if (!oldPwd.trim()) { setPwdError('請輸入目前密碼'); return; }
    if (newPwd.length < 6) { setPwdError('新密碼至少 6 個字元'); return; }
    if (newPwd !== confirmPwd) { setPwdError('兩次密碼不一致'); return; }

    setChanging(true);
    try {
      // 先驗證舊密碼（重新登入）
      const email = user?.email;
      if (!email) { throw new Error('無法取得帳號資訊'); }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: oldPwd });
      if (signInError) { throw new Error('目前密碼錯誤'); }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
      if (updateError) throw updateError;

      showToast('success', '密碼已更新', '請使用新密碼登入');
      setShowPwdModal(false);
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      // 自動重新登入
      setTimeout(() => handleLogout(), 1500);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : '修改失敗');
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs md:text-sm font-medium shrink-0">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden md:block truncate max-w-[80px]">
            {user?.name}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform hidden md:block ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
            {/* 用戶資訊 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-800 truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 truncate">{user?.email}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{roleLabels[user?.role || ''] || user?.role}</div>
            </div>

            <div className="py-1">
              <button onClick={() => { setOpen(false); setShowPwdModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <KeyRound className="w-4 h-4 text-gray-400" />
                修改登入密碼
              </button>
              <button onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 修改密碼 Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">修改登入密碼</h3>
                <p className="text-xs text-gray-500">修改後需重新登入</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">目前密碼</label>
                <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="輸入目前密碼" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">新密碼</label>
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="至少 6 個字元" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">確認新密碼</label>
                <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="再次輸入新密碼" />
              </div>

              {pwdError && (
                <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwdError}</div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowPwdModal(false); setPwdError(''); }}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  取消
                </button>
                <button onClick={handleChangePwd} disabled={changing}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {changing ? '修改中...' : '確認修改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
