import React, { useState, useEffect } from 'react';
import { useSettings } from '@/hooks/useSupabaseData';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { settings, loading, refetch, getSetting, updateSetting } = useSettings();
  
  const [appId, setAppId] = useState('');
  const [appKey, setAppKey] = useState('');
  const [ocrModel, setOcrModel] = useState('gemini-1.5-pro');
  const [ocrApiKey, setOcrApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  // Load settings from Supabase
  useEffect(() => {
    if (!loading) {
      setAppId(getSetting('pospal_app_id', ''));
      setAppKey(getSetting('pospal_app_key', ''));
      setOcrModel(getSetting('ocr_model', 'gemini-1.5-pro'));
      setOcrApiKey(getSetting('ocr_api_key', ''));
    }
  }, [loading, settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSetting('pospal_app_id', appId);
      await updateSetting('pospal_app_key', appKey);
      await updateSetting('ocr_model', ocrModel);
      await updateSetting('ocr_api_key', ocrApiKey);
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
              />
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
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          className="py-2 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          儲存所有設定
        </button>
      </div>
    </div>
  );
}
