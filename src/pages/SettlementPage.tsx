import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Calendar, Edit2, Save, Calculator, RefreshCw, Loader2, ChevronDown
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/supabase';
import DateRangeFilter from '@/components/ui/DateRangeFilter';

const initialSettlement = {
  cash: '', octopus: '', foodpanda: '', payme: '', alipay_hk: '', wechat_hk: '',
  meituan_keeta: '', openrice: '',
  total_amount: '', actual_revenue: '', total_transactions: '',
};

export default function SettlementPage() {
  const { can } = usePermission();

  // Settlement State
  const [settlement, setSettlement] = useState<Record<string, string>>({ ...initialSettlement });
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // History State
  const [settlementHistory, setSettlementHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const [historyRange, setHistoryRange] = useState({ start: thirtyDaysAgo, end: today });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load settlement when date changes
  useEffect(() => {
    loadSettlement(date);
  }, [date]);

  // Load history on mount and when range changes
  useEffect(() => {
    loadSettlementHistory();
  }, [historyRange.start, historyRange.end]);

  const loadSettlement = async (d: string) => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSettlementLoading(true);
    try {
      const res = await apiFetch(`/api/settlements?date=${d}&restaurant_id=${rid}`);
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        setSettlement({
          cash: s.cash?.toString() || '',
          octopus: s.octopus?.toString() || '',
          foodpanda: s.foodpanda?.toString() || '',
          payme: s.payme?.toString() || '',
          alipay_hk: s.alipay_hk?.toString() || '',
          wechat_hk: s.wechat_hk?.toString() || '',
          meituan_keeta: s.meituan_keeta?.toString() || '',
          openrice: s.openrice?.toString() || '',
          total_amount: s.total_amount?.toString() || '',
          actual_revenue: s.actual_revenue?.toString() || '',
          total_transactions: s.total_transactions?.toString() || '',
        });
      } else {
        setSettlement({ ...initialSettlement });
      }
    } catch (e) {
      console.error('載入結算失敗:', e);
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleSubmitSettlement = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSettlementSaving(true);
    setSettlementResult(null);
    try {
      const payload: Record<string, any> = { restaurant_id: rid, settlement_date: date, source: 'manual' };
      for (const [key, val] of Object.entries(settlement)) {
        if (val !== '') payload[key] = parseFloat(val) || 0;
      }
      const res = await apiFetch('/api/settlements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSettlementResult('✅ 結算資料已成功儲存');
        await loadSettlementHistory();
      } else {
        setSettlementResult(`❌ 儲存失敗: ${json.message}`);
      }
    } catch (e: any) {
      setSettlementResult(`❌ 錯誤: ${e.message}`);
    } finally {
      setSettlementSaving(false);
    }
  };

  const handlePospalSync = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setSyncing(true);
    setSyncStatus('⏳ 正在同步 POSPAL 數據，請稍候...');
    try {
      const res = await apiFetch('/api/settlements/sync', {
        method: 'POST',
        body: JSON.stringify({ restaurant_id: rid, date }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncStatus('✅ POSPAL 同步完成！');
        await loadSettlement(date);
        await loadSettlementHistory();
      } else {
        setSyncStatus(`❌ 同步失敗: ${json.message}`);
      }
    } catch (e: any) {
      setSyncStatus(`❌ 同步錯誤: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const loadSettlementHistory = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/settlements/range?start=${historyRange.start}&end=${historyRange.end}&restaurant_id=${rid}`);
      const json = await res.json();
      if (json.success) {
        setSettlementHistory(json.data || []);
      }
    } catch (e) {
      console.error('載入結算歷史失敗:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoryToForm = (record: any) => {
    setDate(record.settlement_date);
    setSettlement({
      cash: record.cash?.toString() || '',
      octopus: record.octopus?.toString() || '',
      foodpanda: record.foodpanda?.toString() || '',
      payme: record.payme?.toString() || '',
      alipay_hk: record.alipay_hk?.toString() || '',
      wechat_hk: record.wechat_hk?.toString() || '',
      meituan_keeta: record.meituan_keeta?.toString() || '',
      openrice: record.openrice?.toString() || '',
      total_amount: record.total_amount?.toString() || '',
      actual_revenue: record.actual_revenue?.toString() || '',
      total_transactions: record.total_transactions?.toString() || '',
    });
  };

  return (
    <div className="space-y-6">
      <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">營業額結算</h1>
        <p className="text-sm text-muted-foreground">記錄各項收款來源，或與 POSPAL 系統同步</p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" /> 每日營業額結算</CardTitle>
          <CardDescription>記錄各項收款來源，或與 POSPAL 系統同步（來源：门店销售汇总）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 操作按鈕 */}
          <div className="flex gap-2 justify-end mb-4">
            {can('expense.manage') && (
              <Button variant="outline" onClick={handlePospalSync} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                POSPAL 同步
              </Button>
            )}
          </div>

          {/* 同步狀態 */}
          {syncStatus && (
            <div className={`p-3 rounded-lg text-sm ${syncStatus.startsWith('✅') ? 'bg-green-50 text-green-700' : syncStatus.startsWith('⏳') ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {syncStatus}
            </div>
          )}

          {/* 日期選擇 */}
          <div>
            <label className="block text-sm font-medium mb-1">日期選擇</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full md:w-1/3" />
          </div>

          {/* 載入中 */}
          {settlementLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2">載入結算數據...</span>
            </div>
          ) : (
            <>
              {/* 支付方式輸入 */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  { key: 'cash', label: '現金支付', icon: '💰' },
                  { key: 'octopus', label: '八達通', icon: '💳' },
                  { key: 'foodpanda', label: 'Foodpanda', icon: '🛵' },
                  { key: 'payme', label: 'Payme', icon: '💳' },
                  { key: 'alipay_hk', label: '支付寶香港', icon: '📱' },
                  { key: 'wechat_hk', label: 'WeChat 香港', icon: '💬' },
                  { key: 'meituan_keeta', label: '美團 KEETA', icon: '🛵' },
                  { key: 'openrice', label: 'Openrice', icon: '🍽️' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium mb-1 text-gray-600">
                      {field.icon} {field.label}
                    </label>
                    <Input
                      type="number" step="0.01" placeholder="0.00"
                      value={settlement[field.key] || ''}
                      onChange={e => setSettlement({ ...settlement, [field.key]: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* 分隔線 */}
              <div className="border-t pt-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-blue-700">📊 總金額</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={settlement.total_amount || ''}
                      onChange={e => setSettlement({ ...settlement, total_amount: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-green-700">📊 營業實收</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={settlement.actual_revenue || ''}
                      onChange={e => setSettlement({ ...settlement, actual_revenue: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-purple-700">📊 總筆數</label>
                    <Input type="number" step="1" placeholder="0" value={settlement.total_transactions || ''}
                      onChange={e => setSettlement({ ...settlement, total_transactions: e.target.value })} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 提交結果 */}
          {settlementResult && (
            <div className={`p-3 rounded-lg text-sm ${settlementResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {settlementResult}
            </div>
          )}

          {/* 提交按鈕 */}
          {can('expense.manage') && (
            <div className="pt-2 flex justify-end">
              <Button onClick={handleSubmitSettlement} disabled={settlementSaving || settlementLoading} className="w-full md:w-auto">
                {settlementSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                提交結算
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====== 結算歷史紀錄 ====== */}
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> 歷史紀錄</CardTitle>
          <CardDescription>瀏覽過往的每日營業額結算記錄</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 日期範圍篩選 */}
          <DateRangeFilter
            startDate={historyRange.start}
            endDate={historyRange.end}
            onChange={(start, end) => {
              setHistoryRange({ start, end });
            }}
          />

          {/* 歷史表格 */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2">載入歷史紀錄...</span>
            </div>
          ) : settlementHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">暫無結算記錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">來源</th>
                    <th className="px-3 py-2 text-right">現金</th>
                    <th className="px-3 py-2 text-right">八達通</th>
                    <th className="px-3 py-2 text-right">外送平台</th>
                    <th className="px-3 py-2 text-right">電子支付</th>
                    <th className="px-3 py-2 text-right">總金額</th>
                    <th className="px-3 py-2 text-right">營業實收</th>
                    <th className="px-3 py-2 text-right">筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementHistory.map((record, idx) => {
                    const isExpanded = expandedRow === record.settlement_date;
                    const online = (parseFloat(record.foodpanda || 0) + parseFloat(record.meituan_keeta || 0) + parseFloat(record.openrice || 0)).toFixed(2);
                    const ePayment = (parseFloat(record.alipay_hk || 0) + parseFloat(record.wechat_hk || 0) + parseFloat(record.octopus || 0)).toFixed(2);
                    return (
                      <tr key={record.settlement_date || idx}
                        className={`border-b hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                        onClick={() => setExpandedRow(isExpanded ? null : record.settlement_date)}>
                        <td className="px-3 py-2">
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        </td>
                        <td className="px-3 py-2 font-medium">{record.settlement_date}</td>
                        <td className="px-3 py-2">
                          <Badge variant={record.source === 'pospal_crawler' ? 'default' : 'secondary'} className="text-xs">
                            {record.source === 'pospal_crawler' ? 'POSPAL' : '手動'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{record.cash ? `$${record.cash}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{record.octopus ? `$${record.octopus}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{online !== '0.00' ? `$${online}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{ePayment !== '0.00' ? `$${ePayment}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700">${record.total_amount || 0}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700">${record.actual_revenue || 0}</td>
                        <td className="px-3 py-2 text-right">{record.total_transactions || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 展開的詳細資訊 */}
          {settlementHistory.map((record) => {
            if (expandedRow !== record.settlement_date) return null;
            return (
              <div key={`detail-${record.settlement_date}`} className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">{record.settlement_date} 詳細數據</h4>
                  {can('expense.manage') && (
                    <Button size="sm" variant="outline" onClick={() => loadHistoryToForm(record)}>
                      <Edit2 className="w-3 h-3 mr-1" /> 載入編輯
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-gray-500">現金：</span><span className="font-medium">${record.cash || 0}</span></div>
                  <div><span className="text-gray-500">八達通：</span><span className="font-medium">${record.octopus || 0}</span></div>
                  <div><span className="text-gray-500">Foodpanda：</span><span className="font-medium">${record.foodpanda || 0}</span></div>
                  <div><span className="text-gray-500">Payme：</span><span className="font-medium">${record.payme || 0}</span></div>
                  <div><span className="text-gray-500">支付寶香港：</span><span className="font-medium">${record.alipay_hk || 0}</span></div>
                  <div><span className="text-gray-500">WeChat 香港：</span><span className="font-medium">${record.wechat_hk || 0}</span></div>
                  <div><span className="text-gray-500">美團 KEETA：</span><span className="font-medium">${record.meituan_keeta || 0}</span></div>
                  <div><span className="text-gray-500">OpenRice：</span><span className="font-medium">${record.openrice || 0}</span></div>
                  <div className="col-span-2 md:col-span-4 border-t pt-2 mt-1">
                    <div className="grid grid-cols-3 gap-3">
                      <div><span className="text-blue-700 font-medium">總金額：</span><span className="font-semibold">${record.total_amount || 0}</span></div>
                      <div><span className="text-green-700 font-medium">營業實收：</span><span className="font-semibold">${record.actual_revenue || 0}</span></div>
                      <div><span className="text-purple-700 font-medium">總筆數：</span><span className="font-semibold">{record.total_transactions || 0}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
