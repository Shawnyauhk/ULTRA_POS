import React, { useState, useEffect } from 'react';
import { useSettings } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
import { Loader2, MapPin, Crosshair } from 'lucide-react';

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
