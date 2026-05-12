import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [appId, setAppId] = useState('');
  const [appKey, setAppKey] = useState('');

  useEffect(() => {
    const savedAppId = localStorage.getItem('pospal_app_id');
    const savedAppKey = localStorage.getItem('pospal_app_key');
    if (savedAppId) setAppId(savedAppId);
    if (savedAppKey) setAppKey(savedAppKey);
  }, []);

  const handleSave = () => {
    localStorage.setItem('pospal_app_id', appId);
    localStorage.setItem('pospal_app_key', appKey);
    alert('設定已儲存');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">系統設置</h1>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-xl">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">POSPAL API 憑證設定</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
            <input 
              type="text" 
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              placeholder="輸入 POSPAL App ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">App Key</label>
            <input 
              type="password" 
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              placeholder="輸入 POSPAL App Key"
            />
          </div>
          
          <button 
            onClick={handleSave}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            儲存設定
          </button>
        </div>
      </div>
    </div>
  );
}
