import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '@/hooks/useSupabaseData';
import { usePermission, clearPermissionCache, refreshCustomPermissions } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@/types';
import type { PermissionKey, RestaurantRole } from '@/types';
import { Loader2, MapPin, Crosshair, Wifi, WifiOff, CheckCircle2, AlertCircle, Globe, MessageSquare, Send, Smartphone, QrCode, Scan, ChevronDown, ChevronRight, Key, Shield, Save } from 'lucide-react';

type RoleName = 'manager' | 'staff';

const ROLES: { key: RoleName; label: string; icon: string }[] = [
  { key: 'manager', label: '主管', icon: '👔' },
  { key: 'staff', label: '員工', icon: '👤' },
];

const PERMISSION_GROUPS: { group: string; permissions: PermissionKey[] }[] = [
  { group: '控制面板', permissions: ['dashboard.view'] },
  { group: 'POS 點餐', permissions: ['pos.create_order', 'pos.cancel_order', 'pos.refund'] },
  { group: '產品管理', permissions: ['product.view', 'product.manage'] },
  { group: '庫存管理', permissions: ['inventory.view', 'inventory.manage'] },
  { group: '訂貨管理', permissions: ['order.view', 'order.create', 'order.approve'] },
  { group: '員工管理', permissions: ['employee.view', 'employee.manage'] },
  { group: '打卡系統', permissions: ['attendance.view', 'attendance.manage'] },
  { group: '排班管理', permissions: ['schedule.view', 'schedule.manage'] },
  { group: '薪酬管理', permissions: ['payroll.view', 'payroll.manage'] },
  { group: '財務支出', permissions: ['expense.view', 'expense.manage'] },
  { group: '報表', permissions: ['report.view', 'report.export'] },
  { group: 'AI 功能', permissions: ['ai.marketing', 'ai.customer_service', 'ai.knowledge_base'] },
  { group: '評價管理', permissions: ['review.view', 'review.manage'] },
  { group: '系統設置', permissions: ['setting.view', 'setting.manage'] },
];

export default function SettingsPage() {
  const { can } = usePermission();
  const { settings, loading, refetch, getSetting, updateSetting } = useSettings();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const [appId, setAppId] = useState('');
  const [appKey, setAppKey] = useState('');
  const [ocrModel, setOcrModel] = useState('gemini-1.5-pro');
  const [ocrApiKey, setOcrApiKey] = useState('');
  const [storeLat, setStoreLat] = useState('');
  const [storeLng, setStoreLng] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const { user } = useAuthStore();

  // 門店 IP
  const [storeIpAuto, setStoreIpAuto] = useState('');
  const [storeIpManual, setStoreIpManual] = useState('');
  const [storeIpSource, setStoreIpSource] = useState<'auto' | 'manual' | 'none'>('none');
  const [storeIpLastUpdate, setStoreIpLastUpdate] = useState('');
  const [savingIp, setSavingIp] = useState(false);
  const [ipStatus, setIpStatus] = useState('');

  // WhatsApp
  const [whatsappSender, setWhatsappSender] = useState('');
  const [whatsappAdmin, setWhatsappAdmin] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [wacliAuthState, setWacliAuthState] = useState<'unknown' | 'loading' | 'done'>('unknown');
  const [wacliQrImage, setWacliQrImage] = useState<string | null>(null);
  const [wacliAuthing, setWacliAuthing] = useState(false);
  const [wacliAuthMessage, setWacliAuthMessage] = useState('');
  const [senderDisabled, setSenderDisabled] = useState(true);
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 權限設定
  const [rolePermissions, setRolePermissions] = useState<Record<RoleName, PermissionKey[]>>({ manager: [], staff: [] });
  const [permLoading, setPermLoading] = useState(true);
  const [permSaving, setPermSaving] = useState(false);
  const [permSaved, setPermSaved] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAppId(getSetting('pospal_app_id', ''));
      setAppKey(getSetting('pospal_app_key', ''));
      setOcrModel(getSetting('ocr_model', 'gemini-1.5-pro'));
      setOcrApiKey(getSetting('ocr_api_key', ''));
      const locStr = getSetting('store_location', '');
      if (locStr) {
        try { const loc = JSON.parse(locStr); setStoreLat(String(loc.lat)); setStoreLng(String(loc.lng)); } catch {}
      }
      setWhatsappSender(getSetting('whatsapp_sender', ''));
      setWhatsappAdmin(getSetting('whatsapp_admin', ''));
    }
  }, [loading, settings]);

  // 權限載入
  useEffect(() => {
    loadPermissions();
  }, [user?.restaurant_id]);

  async function loadPermissions() {
    if (!user?.restaurant_id) return;
    setPermLoading(true);
    try {
      const { data } = await supabase.from('restaurant_roles')
        .select('role_name, permissions')
        .eq('restaurant_id', user.restaurant_id)
        .in('role_name', ['manager', 'staff']);
      const result: Record<RoleName, PermissionKey[]> = { manager: [], staff: [] };
      if (data && data.length > 0) {
        (data as Pick<RestaurantRole, 'role_name' | 'permissions'>[]).forEach((row) => {
          if (row.role_name === 'manager' || row.role_name === 'staff') result[row.role_name] = row.permissions ?? [];
        });
      } else {
        result.manager = DEFAULT_ROLE_PERMISSIONS.manager as PermissionKey[];
        result.staff = DEFAULT_ROLE_PERMISSIONS.staff as PermissionKey[];
      }
      setRolePermissions(result);
    } catch { setRolePermissions({ manager: DEFAULT_ROLE_PERMISSIONS.manager as PermissionKey[], staff: DEFAULT_ROLE_PERMISSIONS.staff as PermissionKey[] });
    } finally { setPermLoading(false); }
  }

  function togglePermission(role: RoleName, permission: PermissionKey) {
    setPermSaved(false);
    setRolePermissions(prev => {
      const current = prev[role];
      const updated = current.includes(permission) ? current.filter(p => p !== permission) : [...current, permission];
      return { ...prev, [role]: updated };
    });
  }

  function roleSelectAll(role: RoleName) { setPermSaved(false); setRolePermissions(prev => ({ ...prev, [role]: Object.keys(ALL_PERMISSIONS) as PermissionKey[] })); }
  function roleDeselectAll(role: RoleName) { setPermSaved(false); setRolePermissions(prev => ({ ...prev, [role]: [] })); }

  async function handleSavePermissions() {
    if (!user?.restaurant_id) return;
    setPermSaving(true); setPermSaved(false);
    try {
      for (const { key } of ROLES) {
        const permissions = rolePermissions[key];
        const rid = user.restaurant_id;
        const { data: existing } = await supabase.from('restaurant_roles').select('id').eq('restaurant_id', rid).eq('role_name', key).maybeSingle();
        if (existing) {
          await supabase.from('restaurant_roles').update({ permissions, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('restaurant_roles').insert({ restaurant_id: rid, role_name: key, permissions });
        }
      }
      clearPermissionCache();
      await refreshCustomPermissions();
      setPermSaved(true);
      setTimeout(() => setPermSaved(false), 3000);
    } catch (err: unknown) {
      alert('儲存失敗: ' + String(err));
    } finally { setPermSaving(false); }
  }

  const fetchStoreIp = useCallback(async () => {
    if (!user?.restaurant_id) return;
    try {
      const res = await apiFetch(`/api/attendance/store/ip?restaurant_id=${user.restaurant_id}`);
      const json = await res.json();
      if (json.success) { setStoreIpAuto(json.data.public_ip); setStoreIpLastUpdate(json.data.last_update); setStoreIpSource(json.data.device_id === 'manual' ? 'manual' : 'auto'); }
      else { setStoreIpAuto(''); setStoreIpSource('none'); }
    } catch { setStoreIpSource('none'); }
  }, [user?.restaurant_id]);
  useEffect(() => { fetchStoreIp(); }, [fetchStoreIp]);

  const handleGetCurrentLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setStoreLat(String(pos.coords.latitude)); setStoreLng(String(pos.coords.longitude)); setLocating(false); },
      err => { alert('取得位置失敗: ' + err.message); setLocating(false); },
      { enableHighAccuracy: true }
    );
  };

  const handleSaveManualIp = async () => {
    if (!user?.restaurant_id || !storeIpManual.trim()) return;
    setSavingIp(true); setIpStatus('');
    try {
      const res = await apiFetch('/api/attendance/store/update-ip', { method: 'POST', body: JSON.stringify({ restaurant_id: user.restaurant_id, manual_ip: storeIpManual.trim(), device_id: 'manual' }) });
      const json = await res.json();
      if (json.success) { setIpStatus('success'); setStoreIpAuto(json.data.public_ip); setStoreIpSource('manual'); setStoreIpLastUpdate(json.data.last_update); }
      else { setIpStatus('error: ' + (json.message || '儲存失敗')); }
    } catch (e: any) { setIpStatus('error: ' + (e.message || '網絡錯誤')); }
    finally { setSavingIp(false); }
  };

  const handleTestWhatsApp = async () => {
    if (!whatsappSender || !whatsappAdmin) { setTestResult({ success: false, message: '請先填寫發送號碼和接收號碼' }); return; }
    setTestSending(true); setTestResult(null);
    try {
      const res = await apiFetch('/api/whatsapp/test-send', { method: 'POST', body: JSON.stringify({ restaurant_id: user?.restaurant_id, sender: whatsappSender, admin: whatsappAdmin }) });
      setTestResult(await res.json());
    } catch (e: any) { setTestResult({ success: false, message: e.message || '網絡錯誤' }); }
    finally { setTestSending(false); }
  };

  const handleAuthWhatsApp = async () => {
    setWacliAuthing(true); setWacliQrImage(null); setWacliAuthMessage('正在獲取 QR Code...');
    try {
      const res = await apiFetch('/api/whatsapp/auth-qr', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.authenticated) { setWacliAuthState('done'); setSenderDisabled(false); setWacliAuthMessage('✅ 已認證，可以設定發送號碼'); }
      else if (json.qrImage) {
        setWacliQrImage(json.qrImage); setWacliAuthState('loading'); setWacliAuthMessage('📱 請用 WhatsApp 掃描 QR Code');
        authPollRef.current = setInterval(async () => {
          try { const st = await (await apiFetch('/api/whatsapp/auth-status')).json(); if (st.authenticated) { setWacliAuthState('done'); setSenderDisabled(false); setWacliQrImage(null); setWacliAuthMessage('✅ 認證成功！可設定發送號碼'); if (authPollRef.current) clearInterval(authPollRef.current); authPollRef.current = null; } } catch {}
        }, 2000);
      } else { setWacliAuthMessage('❌ ' + (json.message || '獲取 QR Code 失敗')); }
    } catch (e: any) { setWacliAuthMessage('❌ 網絡錯誤: ' + e.message); }
    finally { setWacliAuthing(false); }
  };

  useEffect(() => { return () => { if (authPollRef.current) clearInterval(authPollRef.current); }; }, []);

  const toggleSection = (id: string) => setExpandedSection(prev => prev === id ? null : id);

  const SectionCard = ({ id, icon, title, badge, children }: { id: string; icon: React.ReactNode; title: string; badge: string; children: React.ReactNode }) => {
    const isOpen = expandedSection === id;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button onClick={() => toggleSection(id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
          <div className="flex items-center gap-3 min-w-0">
            {icon}<span className="font-medium text-gray-800">{title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">{badge}</span>
          </div>
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
        {isOpen && <div className="px-5 pb-5">{children}</div>}
      </div>
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSetting('pospal_app_id', appId);
      await updateSetting('pospal_app_key', appKey);
      await updateSetting('ocr_model', ocrModel);
      await updateSetting('ocr_api_key', ocrApiKey);
      await updateSetting('whatsapp_sender', whatsappSender);
      await updateSetting('whatsapp_admin', whatsappAdmin);
      if (storeLat && storeLng) await updateSetting('store_location', JSON.stringify({ lat: parseFloat(storeLat), lng: parseFloat(storeLng) }));
      alert('設定已儲存');
    } catch (err) { console.error('Error saving settings:', err); alert('儲存失敗'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-3 md:p-6 space-y-4">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">系統設置</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <SectionCard id="pospal" icon={<Key className="w-5 h-5 text-blue-500" />} title="POSPAL API 憑證" badge="餐廳系統">
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input type="text" value={appId} onChange={e => setAppId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="輸入 POSPAL App ID" disabled={saving} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">App Key</label>
              <input type="password" value={appKey} onChange={e => setAppKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="輸入 POSPAL App Key" disabled={saving} /></div>
          </div>
        </SectionCard>

        <SectionCard id="location" icon={<MapPin className="w-5 h-5 text-red-500" />} title="店舖位置" badge="GPS">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">設定店舖 GPS 座標，員工打卡時系統會自動檢查是否在店舖範圍內（200 公尺）。</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">緯度</label><input type="text" value={storeLat} onChange={e => setStoreLat(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="22.3193" disabled={saving} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">經度</label><input type="text" value={storeLng} onChange={e => setStoreLng(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="114.1694" disabled={saving} /></div>
            </div>
            <button onClick={handleGetCurrentLocation} disabled={locating || saving} className="w-full py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}{locating ? '偵測中...' : '使用目前位置作為店舖座標'}
            </button>
          </div>
        </SectionCard>

        <SectionCard id="storeIp" icon={<Wifi className="w-5 h-5 text-green-500" />} title="門店網絡 IP" badge="打卡">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">設定門店的公網 IP，員工連上門店 WiFi 打卡時，系統會比對 IP 來確認是否在店內。</p>
            <div className={`p-4 rounded-lg text-sm ${storeIpSource !== 'none' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {storeIpSource !== 'none' ? <><Wifi className="w-4 h-4" /><span className="font-medium">當前門店 IP</span></> : <><WifiOff className="w-4 h-4" /><span className="font-medium">尚未設定門店 IP</span></>}
              </div>
              {storeIpSource !== 'none' && <><p className="font-mono text-lg font-bold mb-1">{storeIpAuto}</p>
                <div className="flex items-center gap-2 text-xs"><Badge variant="outline" className={storeIpSource === 'auto' ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-purple-700 bg-purple-50 border-purple-200'}>{storeIpSource === 'auto' ? '打卡機自動上報' : '手動設定'}</Badge><span>更新於 {storeIpLastUpdate ? new Date(storeIpLastUpdate).toLocaleString('zh-HK') : '-'}</span></div></>}
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1"><Globe className="w-4 h-4 inline mr-1" />手動設定門店 IP</label>
              <div className="flex gap-2"><input type="text" value={storeIpManual} onChange={e => setStoreIpManual(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono" placeholder="例如：123.123.123.123" disabled={savingIp} />
                <button onClick={handleSaveManualIp} disabled={savingIp || !storeIpManual.trim()} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 text-sm font-medium flex items-center gap-1">{savingIp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}設定</button></div>
              {ipStatus && <p className={`mt-1 text-xs ${ipStatus.startsWith('error') ? 'text-red-500' : 'text-green-600'}`}>{ipStatus.startsWith('error') ? ipStatus.slice(6) : '門店 IP 已更新'}</p>}
            </div>
          </div>
        </SectionCard>

        <SectionCard id="whatsapp" icon={<MessageSquare className="w-5 h-5 text-green-500" />} title="WhatsApp 通知" badge="訂貨">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">設定訂貨通知的發送號碼和接收號碼。修改發送號碼前請先掃碼登入 WhatsApp。</p>
            <div className={`p-4 rounded-lg border ${wacliAuthState === 'done' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-1.5"><QrCode className={`w-4 h-4 ${wacliAuthState === 'done' ? 'text-green-600' : 'text-blue-500'}`} />發送號碼 WhatsApp 認證</span>
                {wacliAuthState === 'done' ? <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">✅ 已認證</span> : <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">未認證</span>}
              </div>
              {wacliQrImage && <div className="flex flex-col items-center mb-3"><div className="bg-white p-3 rounded-lg shadow-sm border"><img src={wacliQrImage} alt="WhatsApp QR Code" className="w-48 h-48" /></div><p className="text-xs text-gray-500 mt-2">請打開 WhatsApp → 三點選單 → 連結裝置 → 掃描此 QR Code</p></div>}
              {wacliAuthMessage && <p className={`text-xs mb-2 ${wacliAuthMessage.includes('✅') ? 'text-green-700' : wacliAuthMessage.includes('❌') ? 'text-red-600' : 'text-blue-600'}`}>{wacliAuthMessage}</p>}
              <button onClick={handleAuthWhatsApp} disabled={wacliAuthing || wacliAuthState === 'done'} className={`w-full py-2 px-4 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${wacliAuthState === 'done' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                {wacliAuthing ? <Loader2 className="w-4 h-4 animate-spin" /> : wacliAuthState === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Scan className="w-4 h-4" />}
                {wacliAuthing ? '取得 QR Code 中...' : wacliAuthState === 'done' ? '已認證' : '掃碼登入 WhatsApp'}
              </button>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1"><Smartphone className="w-4 h-4 inline mr-1 text-blue-500" />發送號碼（店舖 WhatsApp）</label>
              <input type="text" value={whatsappSender} onChange={e => setWhatsappSender(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono" placeholder="+85298765432" disabled={senderDisabled || saving} />
              <p className="text-xs text-gray-400 mt-1">{senderDisabled ? '🔒 請先掃碼登入 WhatsApp 以啟用此欄位' : '用哪個 WhatsApp 帳號發送通知'}</p></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1"><Smartphone className="w-4 h-4 inline mr-1 text-orange-500" />接收號碼（管理員 WhatsApp）</label>
              <input type="text" value={whatsappAdmin} onChange={e => setWhatsappAdmin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono" placeholder="+85291234567" disabled={saving} />
              <p className="text-xs text-gray-400 mt-1">通知發送到哪個號碼</p></div>
            <button onClick={handleTestWhatsApp} disabled={testSending || !whatsappSender || !whatsappAdmin} className="w-full py-2 px-4 border border-green-300 rounded-md text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 flex items-center justify-center gap-2">
              {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{testSending ? '發送中...' : '測試發送 WhatsApp 通知'}
            </button>
            {testResult && <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}{testResult.message}</div>}
          </div>
        </SectionCard>

        <SectionCard id="ocr" icon={<Globe className="w-5 h-5 text-purple-500" />} title="AI OCR 模型" badge="掃描">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">設定門店支出收據掃描所使用的 AI 模型。</p>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">模型名稱</label>
              <select value={ocrModel} onChange={e => setOcrModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" disabled={saving}>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (預設)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gpt-4o">OpenAI GPT-4o</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
                <option value="custom">自定義模型...</option>
              </select></div>
            {ocrModel === 'custom' && <div><label className="block text-sm font-medium text-gray-700 mb-1">自定義模型名稱</label><input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="my-custom-model" disabled={saving} /></div>}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">API Key</label><input type="password" value={ocrApiKey} onChange={e => setOcrApiKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="輸入 API 密鑰" disabled={saving} /></div>
          </div>
        </SectionCard>

        {/* 權限設定 */}
        <SectionCard id="permissions" icon={<Shield className="w-5 h-5 text-indigo-500" />} title="權限設定" badge="角色">
          {permLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              {permSaved && <div className="flex items-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200"><CheckCircle2 className="w-5 h-5" />權限設定已成功儲存！</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLES.map(({ key, label, icon }) => (
                  <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2"><span className="text-lg">{icon}</span><h3 className="font-semibold text-gray-900">{label}</h3></div>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={() => roleSelectAll(key)} className="px-2 py-1 text-primary hover:bg-primary/5 rounded">全選</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => roleDeselectAll(key)} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">全部取消</button>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {PERMISSION_GROUPS.map(({ group, permissions }) => {
                        const selectedCount = permissions.filter(p => rolePermissions[key].includes(p)).length;
                        return (
                          <div key={group}>
                            <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-medium text-gray-700">{group}</h4><span className="text-xs text-gray-400">{selectedCount}/{permissions.length}</span></div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {permissions.map(perm => (
                                <label key={perm} className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                                  <input type="checkbox" checked={rolePermissions[key].includes(perm)} onChange={() => togglePermission(key, perm)} className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary shrink-0" />
                                  <span className="text-xs text-gray-600 whitespace-nowrap">{ALL_PERMISSIONS[perm]}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={handleSavePermissions} disabled={permSaving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium text-sm">
                  {permSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{permSaving ? '儲存中...' : '儲存權限設定'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {can('setting.manage') && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="py-2 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}儲存所有設定
          </button>
        </div>
      )}
    </div>
  );
}
