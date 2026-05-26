import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, QrCode, RefreshCw, Users, Clock, Calendar, Wifi } from 'lucide-react';

export default function AttendanceDevicePage() {
  const { user } = useAuthStore();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const restaurantId = user?.restaurant_id;

  // 每秒更新時間
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 生成 QR Code
  const generateQR = useCallback(async () => {
    if (!restaurantId) return;
    setQrLoading(true);
    try {
      const res = await apiFetch('/api/attendance/device/generate-qrcode', {
        method: 'POST',
        body: JSON.stringify({ restaurant_id: restaurantId, device_id: 'kiosk' }),
      });
      const json = await res.json();
      if (json.success) {
        setQrDataUrl(json.data.qr_data_url);
        setToken(json.data.token);
        setExpiresAt(json.data.expires_at);
        setDeviceIp(json.data.device_ip);
      }
    } catch (e: any) {
      console.error('QR生成失敗:', e);
    } finally {
      setQrLoading(false);
    }
  }, [restaurantId]);

  // 載入今日打卡記錄
  const loadToday = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(`/api/attendance/today?restaurant_id=${restaurantId}`);
      const json = await res.json();
      if (json.success) setTodayRecords(json.data || []);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // 每 9 秒刷新 QR Code
  useEffect(() => {
    if (!restaurantId) return;
    generateQR();
    loadToday();
    pollingRef.current = setInterval(() => {
      generateQR();
      loadToday();
    }, 9000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [restaurantId, generateQR, loadToday]);

  const timeStr = now.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex flex-col">
      {/* 頂部時間條 */}
      <header className="bg-white shadow-sm border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-600" />
          <span className="text-lg font-semibold text-gray-800">{timeStr}</span>
          <span className="text-sm text-gray-500">{dateStr}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Wifi className="w-4 h-4" />
          <span>裝置 IP: {deviceIp || '...'}</span>
          <Button variant="ghost" size="sm" onClick={generateQR} disabled={qrLoading}>
            <RefreshCw className={`w-4 h-4 ${qrLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto w-full">
        {/* 左欄：QR Code */}
        <Card className="flex flex-col items-center justify-center">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <QrCode className="w-6 h-6 text-blue-600" /> 打卡 QR Code
            </CardTitle>
            <CardDescription>員工使用手機掃描此 QR Code 打卡</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            {qrLoading && !qrDataUrl ? (
              <div className="w-72 h-72 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
              </div>
            ) : qrDataUrl ? (
              <>
                <div className="bg-white p-4 rounded-xl shadow-lg">
                  <img src={qrDataUrl} alt="打卡 QR Code" className="w-72 h-72" />
                </div>
                <p className="text-xs text-gray-400">
                  QR Code 每 9 秒自動刷新 · 掃碼後 10 秒內有效
                </p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${new Date(expiresAt).getTime() > Date.now() ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-gray-500">
                    {new Date(expiresAt).getTime() > Date.now() ? '有效' : '刷新中...'}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-gray-400">無法生成 QR Code，請檢查網絡</p>
            )}
          </CardContent>
        </Card>

        {/* 右欄：今日打卡記錄 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-blue-600" /> 今日打卡記錄
            </CardTitle>
            <CardDescription>
              {loading ? '載入中...' : `${todayRecords.length} 位員工`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            ) : todayRecords.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>今日尚無打卡記錄</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {todayRecords.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                        {r.employee?.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{r.employee?.name || '未知'}</p>
                        <p className="text-xs text-gray-400">{r.employee?.role || ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {r.clock_in && (
                          <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                            ↑ {r.clock_in}
                          </Badge>
                        )}
                        {r.clock_out && (
                          <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200">
                            ↓ {r.clock_out}
                          </Badge>
                        )}
                        {!r.clock_out && r.clock_in && (
                          <Badge variant="warning" className="text-yellow-700 bg-yellow-50 border-yellow-200">
                            工作中
                          </Badge>
                        )}
                      </div>
                      {r.work_hours && (
                        <p className="text-xs text-gray-400 mt-1">{r.work_hours} 小時</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 底部操作提示 */}
      <footer className="bg-white border-t px-6 py-3 text-center text-sm text-gray-400">
        📱 將此裝置放在店鋪固定位置，員工用自己的手機掃 QR Code 即可打卡
      </footer>
    </div>
  );
}
