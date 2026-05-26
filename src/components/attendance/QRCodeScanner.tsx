import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, CameraOff, CheckCircle2, AlertCircle, LogIn, LogOut, Clock, ScanLine } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';

type ClockType = 'in' | 'out';

interface QRCodeScannerProps {
  onSuccess?: () => void;
}

export function QRCodeScanner({ onSuccess }: QRCodeScannerProps) {
  const { user } = useAuthStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [clockType, setClockType] = useState<ClockType>('in');

  // 啟動相機
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      setCameraActive(true);
    } catch (err: any) {
      setResult({ success: false, message: '無法啟動相機：' + (err.message || '請允許相機權限') });
    }
  }, []);

  // 停止相機
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    scanningRef.current = false;
    setScanning(false);
  }, []);

  // 掃碼循環
  const scanLoop = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !scanningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(() => scanLoop());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
      // 動態導入 jsQR
      const jsQR = (await import('jsqr')).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        // 找到 QR Code，提取 token
        const url = code.data;
        const tokenMatch = url.match(/[?&]qrcode=([^&]+)/);
        if (tokenMatch) {
          scanningRef.current = false;
          setScanning(false);
          stopCamera();
          await doClock(tokenMatch[1]);
          return;
        }
      }
    } catch (e) {
      // jsQR import error, continue
    }

    if (scanningRef.current) {
      requestAnimationFrame(() => scanLoop());
    }
  }, [stopCamera]);

  // 開始掃描
  const handleStartScan = useCallback(async () => {
    setResult(null);
    setScanning(true);
    scanningRef.current = true;

    if (!cameraActive) {
      await startCamera();
    }
    // 延遲開始掃描（等待相機啟動）
    setTimeout(() => {
      scanLoop();
    }, 500);
  }, [cameraActive, startCamera, scanLoop]);

  // 停止掃描
  const handleStopScan = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
    stopCamera();
  }, [stopCamera]);

  // 打卡
  const doClock = async (token: string) => {
    if (!user?.id || !user?.restaurant_id) {
      setResult({ success: false, message: '請先登入' });
      return;
    }

    setClocking(true);
    try {
      const res = await apiFetch('/api/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({
          token,
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

  // 清理
  useEffect(() => {
    return () => {
      scanningRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-blue-600" />
          QR Code 掃碼打卡
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* 相機畫面 */}
        {cameraActive || scanning ? (
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-64 object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-blue-400 rounded-lg opacity-60" />
              </div>
            )}
            {clocking && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-white" />
              </div>
            )}
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50"
            onClick={handleStartScan}
          >
            <Camera className="w-10 h-10 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">點擊開啟相機掃描 QR Code</p>
            <p className="text-xs text-gray-400 mt-1">對準公司打卡機上的 QR Code</p>
          </div>
        )}

        {/* 控制按鈕 */}
        <div className="flex gap-2">
          {scanning ? (
            <Button onClick={handleStopScan} variant="destructive" className="flex-1">
              <CameraOff className="w-4 h-4 mr-2" /> 停止掃描
            </Button>
          ) : cameraActive ? (
            <Button onClick={handleStartScan} className="flex-1">
              繼續掃描
            </Button>
          ) : null}
          {!scanning && !cameraActive && (
            <Button onClick={handleStartScan} className="w-full">
              <Camera className="w-4 h-4 mr-2" /> 打開相機
            </Button>
          )}
        </div>

        {/* 結果提示 */}
        {result && (
          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        <div className="text-xs text-gray-400 text-center">
          掃碼打卡需連上店鋪 WiFi · 公司打卡機 QR Code 每 10 秒刷新
        </div>
      </CardContent>
    </Card>
  );
}
