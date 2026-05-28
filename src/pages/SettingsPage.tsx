import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';
import { Loader2, MapPin, Crosshair, Wifi, WifiOff, CheckCircle2, AlertCircle, Globe } from 'lucide-react';

export default function SettingsPage() {
  const { can } = usePermission();
  const { settings, loading, refetch, getSetting, updateSetting } = useSettings();
  
  const [appId, setAppId] = useState('');
  const [appKey, setAppKey] = useState('');
  const [ocrModel, setOcrModel] = useState('gemini-1.5-pro');
  const [ocrApiKey, setOcrApiKey] = useState('');
  const [storeLat, setStoreLat] = useState('');
  const [storeLng, setStoreLng] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  
  // 門店 IP 設定
  const { user } = useAuthStore();
  const [storeIpAuto, setStoreIpAuto] = useState('');     // 裝置自動上報的 IP
  const [storeIpManual, setStoreIpManual] = useState('');  // 手動填寫的 IP
  const [storeIpSource, setStoreIpSource] = useState<'auto' | 'manual' | 'none'>('none');
  const [storeIpLastUpdate, setStoreIpLastUpdate] = useState('');
  const [savingIp, setSavingIp] = useState(false);
  const [ipStatus, setIpStatus] = useState('');

  // Load settings from Supabase
  useEffect(() => {
    if (!loading) {
      setAppId(getSetting('pospal_app_id', ''));
      setAppKey(getSetting('pospal_app_key', ''));
      setOcrModel(getSetting('ocr_model', 'gemini-1.5-pro'));
      setOcrApiKey(getSetting('ocr_api_key', ''));
      // 載入店舖位置
      const locStr = getSetting('store_location', '');
      if (locStr) {
        try {
          const loc = JSON.parse(locStr);
          setStoreLat(String(loc.lat));
          setStoreLng(String(loc.lng));
        } catch {}
      }
    }
  }, [loading, settings]);

  // 讀取門店 IP 狀態
  const fetchStoreIp = useCallback(async () => {
    if (!user?.restaurant_id) return;
    try {
      const res = await apiFetch(`/api/attendance/store/ip?restaurant_id=${user.restaurant_id}`);
      const json = await res.json();
      if (json.success) {
        setStoreIpAuto(json.data.public_ip);
        setStoreIpLastUpdate(json.data.last_update);
        setStoreIpSource(json.data.device_id === 'manual' ? 'manual' : 'auto');
      } else {
        setStoreIpAuto('');
        setStoreIpSource('none');
      }
    } catch {
      setStoreIpSource('none');
    }
  }, [user?.restaurant_id]);

  // 載入門店 IP 狀態
  useEffect(() => {
    fetchStoreIp();
  }, [fetchStoreIp]);

  const handleGetCurrentLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStoreLat(String(pos.coords.latitude));
        setStoreLng(String(pos.coords.longitude));
        setLocating(false);
      },
      (err) => {
        alert('取得位置失敗: ' + err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // 手動設定門店 IP
  const handleSaveManualIp = async () => {
    if (!user?.restaurant_id || !storeIpManual.trim()) return;
    setSavingIp(true);
    setIpStatus('');
    try {
      const res = await apiFetch('/api/attendance/store/update-ip', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: user.restaurant_id,
          manual_ip: storeIpManual.trim(),
          device_id: 'manual',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIpStatus('success');
        setStoreIpAuto(json.data.public_ip);
        setStoreIpSource('manual');
        setStoreIpLastUpdate(json.data.last_update);
      } else {
        setIpStatus('error: ' + (json.message || '儲存失敗'));
      }
    } catch (e: any) {
      setIpStatus('error: ' + (e.message || '網絡錯誤'));
    } finally {
      setSavingIp(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSetting('pospal_app_id', appId);
      await updateSetting('pospal_app_key', appKey);
      await updateSetting('ocr_model', ocrModel);
      await updateSetting('ocr_api_key', ocrApiKey);
      // 儲存店舖位置
      if (storeLat && storeLng) {
        await updateSetting('store_location', JSON.stringify({
          lat: parseFloat(storeLat),
          lng: parseFloat(storeLng),
        }));
      }
      alert('設定已儲存至 Supabase');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">系統設置 Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* POSPAL Settings */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">POSPAL API 憑證設定</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input 
                type="text" 
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="輸入 POSPAL App ID"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App Key</label>
              <input 
                type="password" 
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="輸入 POSPAL App Key"
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Store Location Settings */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500" /> 店舖位置設定
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            設定店舖 GPS 座標，員工打卡時系統會自動檢查是否在店舖範圍內（200 公尺）。
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">緯度 (Latitude)</label>
                <input
                  type="text"
                  value={storeLat}
                  onChange={(e) => setStoreLat(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="22.3193"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">經度 (Longitude)</label>
                <input
                  type="text"
                  value={storeLng}
                  onChange={(e) => setStoreLng(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="114.1694"
                  disabled={saving}
                />
              </div>
            </div>
            <button
              onClick={handleGetCurrentLocation}
              disabled={locating || saving}
              className="w-full py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {locating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              {locating ? '偵測中...' : '使用目前位置作為店舖座標'}
            </button>
          </div>
        </div>

        {/* 門店 IP 設定 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-green-500" /> 門店網絡 IP 設定
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            設定門店的公網 IP，員工連上門店 WiFi 打卡時，系統會比對 IP 來確認是否在店內。
            如果有打卡機裝置，會自動上報 IP；如果沒有，可以在這裡手動填寫。
          </p>
          <div className="space-y-4">
            {/* 當前 IP 狀態 */}
            <div className={`p-4 rounded-lg text-sm ${
              storeIpSource !== 'none'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {storeIpSource !== 'none' ? (
                  <><Wifi className="w-4 h-4" /><span className="font-medium">當前門店 IP</span></>
                ) : (
                  <><WifiOff className="w-4 h-4" /><span className="font-medium">尚未設定門店 IP</span></>
                )}
              </div>
              {storeIpSource !== 'none' && (
                <>
                  <p className="font-mono text-lg font-bold mb-1">{storeIpAuto}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={
                      storeIpSource === 'auto'
                        ? 'text-blue-700 bg-blue-50 border-blue-200'
                        : 'text-purple-700 bg-purple-50 border-purple-200'
                    }>
                      {storeIpSource === 'auto' ? '打卡機自動上報' : '手動設定'}
                    </Badge>
                    <span>更新於 {storeIpLastUpdate ? new Date(storeIpLastUpdate).toLocaleString('zh-HK') : '-'}</span>
                  </div>
                </>
              )}
            </div>

            {/* 手動設定 IP */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Globe className="w-4 h-4 inline mr-1" />
                手動設定門店 IP（沒有打卡機時使用）
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={storeIpManual}
                  onChange={(e) => setStoreIpManual(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                  placeholder="例如：123.123.123.123"
                  disabled={savingIp}
                />
                <button
                  onClick={handleSaveManualIp}
                  disabled={savingIp || !storeIpManual.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 text-sm font-medium flex items-center gap-1"
                >
                  {savingIp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  設定
                </button>
              </div>
              {ipStatus && (
                <p className={`mt-1 text-xs ${ipStatus.startsWith('error') ? 'text-red-500' : 'text-green-600'}`}>
                  {ipStatus.startsWith('error') ? ipStatus.slice(6) : '門店 IP 已更新'}
                </p>
              )}
            </div>

            <div className="text-xs text-gray-400 space-y-1">
              <p>• 有打卡機裝置：放在店內並保持開機，會自動每 30 秒上報 IP</p>
              <p>• 無打卡機裝置：在這裡手動填入門店路由器的公網 IP</p>
              <p>• 如果 IP 有更新，系統會自動使用最新的記錄</p>
              <p>• 不知道公網 IP？可以打開 <a href="https://api.ipify.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">api.ipify.org</a> 查看</p>
            </div>
          </div>
        </div>

        {/* OCR Model Settings */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">AI OCR 模型設定</h2>
          <p className="text-sm text-gray-500 mb-4">設定門店支出收據掃描所使用的 AI 模型，支援靈活切換。</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模型名稱 (Model Provider)</label>
              <select 
                value={ocrModel}
                onChange={(e) => setOcrModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={saving}
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (預設)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gpt-4o">OpenAI GPT-4o</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
                <option value="custom">自定義模型...</option>
              </select>
            </div>
            {ocrModel === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">自定義模型名稱</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="例如：my-custom-ocr-model"
                  disabled={saving}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input 
                type="password" 
                value={ocrApiKey}
                onChange={(e) => setOcrApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="輸入 API 密鑰"
                disabled={saving}
              />
            </div>
          </div>
        </div>
      </div>
      
      {can('setting.manage') && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            儲存所有設定
          </button>
        </div>
      )}
    </div>
  );
}
