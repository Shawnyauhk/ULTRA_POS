import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wifi, WifiOff, CheckCircle2, AlertCircle, LogIn, LogOut, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';

interface WiFiClockInProps {
  onSuccess?: () => void;
}

export function WiFiClockIn({ onSuccess }: WiFiClockInProps) {
  const { user } = useAuthStore();
  const [clockType, setClockType] = useState<'in' | 'out'>('in');
  const [clocking, setClocking] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [storeIp, setStoreIp] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // 檢查門店 IP 狀態
  const checkStoreIp = useCallback(async () => {
    if (!user?.restaurant_id) return;
    setChecking(true);
    try {
      const res = await apiFetch(`/api/attendance/store/ip?restaurant_id=${user.restaurant_id}`);
      const json = await res.json();
      if (json.success) {
        setStoreIp(json.data.public_ip);
      } else {
        setStoreIp(null);
      }
    } catch {
      setStoreIp(null);
    } finally {
      setChecking(false);
    }
  }, [user?.restaurant_id]);

  // 打卡
  const doWiFiClock = async () => {
    if (!user?.id || !user?.restaurant_id) {
      setResult({ success: false, message: '請先登入' });
      return;
    }

    setClocking(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/attendance/wifi-clock', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: user.id,
          restaurant_id: user.restaurant_id,
          clock_type: clockType,
        }),
      });
      const json = await res.json();
      setResult({
        success: json.success,
        message: json.message || json.error || '打卡失敗',
      });
      if (json.success) onSuccess?.();
    } catch (e: any) {
      setResult({ success: false, message: '網絡錯誤：' + (e.message || '請檢查連線') });
    } finally {
      setClocking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-green-600" />
          WiFi 打卡（最簡便）
        </CardTitle>
        <CardDescription>
          連上門店 WiFi 後直接打卡，無需掃碼
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 門店 WiFi 狀態 */}
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          storeIp ? 'bg-green-50 text-green-700' : checking ? 'bg-gray-50 text-gray-500' : 'bg-red-50 text-red-700'
        }`}>
          {checking ? (
            <><Loader2 className="w-4 h-4 animate-spin" /><span>檢查門店網絡狀態...</span></>
          ) : storeIp ? (
            <><Wifi className="w-4 h-4" /><span>門店打卡機已連線</span></>
          ) : (
            <><WifiOff className="w-4 h-4" /><span>門店打卡機尚未上線，請通知管理員</span></>
          )}
        </div>

        {/* 選擇打卡類型 */}
        <div className="flex gap-2">
          <Button
            variant={clockType === 'in' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setClockType('in'); setResult(null); }}
          >
            <LogIn className="w-4 h-4 mr-2" /> 上班
          </Button>
          <Button
            variant={clockType === 'out' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setClockType('out'); setResult(null); }}
          >
            <LogOut className="w-4 h-4 mr-2" /> 下班
          </Button>
        </div>

        {/* 打卡按鈕 */}
        <Button
          onClick={doWiFiClock}
          disabled={clocking || !storeIp}
          size="lg"
          className="w-full"
        >
          {clocking ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 打卡中...</>
          ) : (
            <><Wifi className="w-5 h-5 mr-2" /> {clockType === 'in' ? '上班打卡' : '下班打卡'}</>
          )}
        </Button>

        {/* 結果提示 */}
        {result && (
          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
            result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {result.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        <div className="text-xs text-gray-400 text-center space-y-1">
          <p>需要連上門店 WiFi 才能打卡</p>
          <p>系統會自動比對您的 IP 與門店打卡機的 IP</p>
        </div>
      </CardContent>
    </Card>
  );
}
