import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wifi, WifiOff, RefreshCw, Users, Clock, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AttendanceDevicePage() {
  const { user } = useAuthStore();
  const [deviceIp, setDeviceIp] = useState('');
  const [lastReport, setLastReport] = useState<Date | null>(null);
  const [reportStatus, setReportStatus] = useState<'idle' | 'reporting' | 'success' | 'error'>('idle');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const restaurantId = user?.restaurant_id;

  // 每秒更新時間
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 上報門店 IP
  const reportStoreIp = useCallback(async () => {
    if (!restaurantId) return;
    setReportStatus('reporting');
    try {
      const res = await apiFetch('/api/attendance/store/update-ip', {
        method: 'POST',
        body: JSON.stringify({ restaurant_id: restaurantId, device_id: 'kiosk' }),
      });
      const json = await res.json();
      if (json.success) {
        setDeviceIp(json.data.public_ip);
        setLastReport(new Date());
        setReportStatus('success');
      } else {
        setReportStatus('error');
      }
    } catch {
      setReportStatus('error');
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

  // 首次加載 + 定時上報 IP
  useEffect(() => {
    if (!restaurantId) return;
    reportStoreIp();
    loadToday();
    pollingRef.current = setInterval(() => {
      reportStoreIp();
      loadToday();
    }, 30000); // 每 30 秒上報一次 IP
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [restaurantId, reportStoreIp, loadToday]);

  const timeStr = now.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const lastReportStr = lastReport
    ? lastReport.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '尚未上報';

  const secondsSinceReport = lastReport
    ? Math.floor((now.getTime() - lastReport.getTime()) / 1000)
    : 999;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex flex-col">
      {/* 頂部時間條 */}
      <header className="bg-white shadow-sm border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-600" />
          <span className="text-lg font-semibold text-gray-800">{timeStr}</span>
          <span className="text-sm text-gray-500">{dateStr}</span>
        </div>
        <div className="flex items-center gap-3">
          {reportStatus === 'success' ? (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" /> 已上報 {lastReportStr}
            </span>
          ) : reportStatus === 'error' ? (
            <span className="flex items-center gap-1 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" /> 上報失敗
            </span>
          ) : reportStatus === 'reporting' ? (
            <span className="flex items-center gap-1 text-sm text-blue-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 上報中...
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={reportStoreIp}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto w-full">
        {/* 左欄：門店網絡狀態 */}
        <Card className="flex flex-col items-center justify-center">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Wifi className="w-6 h-6 text-green-600" /> 門店網絡狀態
            </CardTitle>
            <CardDescription>
              此裝置自動上報門店公網 IP，供員工打卡時驗證
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6 w-full max-w-sm">
            {/* IP 顯示 */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-2xl border border-green-200 w-full text-center">
              {deviceIp ? (
                <>
                  <p className="text-xs text-green-600 mb-2">門店公網 IP</p>
                  <p className="text-3xl font-mono font-bold text-green-800 tracking-wider">
                    {deviceIp}
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>獲取中...</span>
                </div>
              )}
            </div>

            {/* 狀態信息 */}
            <div className="w-full space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">上次上報</span>
                <span className="font-medium">{lastReportStr}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">已過時間</span>
                <span className={`font-medium ${secondsSinceReport > 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {secondsSinceReport < 60 ? `${secondsSinceReport} 秒` : `${Math.floor(secondsSinceReport / 60)} 分 ${secondsSinceReport % 60} 秒`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">裝置模式</span>
                <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">自動上報</Badge>
              </div>
            </div>

            {/* 上報狀態指示器 */}
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                secondsSinceReport < 35 ? 'bg-green-500 animate-pulse' :
                secondsSinceReport < 120 ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className="text-sm text-gray-500">
                {secondsSinceReport < 35 ? '正常運作' :
                 secondsSinceReport < 120 ? '可能延遲' : '離線'}
              </span>
            </div>

            <p className="text-xs text-gray-400 text-center">
              自動每 30 秒上報一次 IP · 員工無需掃碼，連 WiFi 即可打卡
            </p>
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
        將此裝置放在店鋪，保持開機並連上 WiFi · 員工用自己的手機打開打卡頁面即可一鍵打卡
      </footer>
    </div>
  );
}
