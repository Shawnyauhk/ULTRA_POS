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
  total_amount: '',
};

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];
const formatDateWithWeekday = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${dateStr}(${WEEKDAY_CN[d.getDay()]})`;
};
const $ = (v: any) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ====== 年區塊（點擊展開收起）=======
function YearBlock({ year, total, cashTotal, octopusTotal, count, children }: {
  year: string; total: number; cashTotal: number; octopusTotal: number; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 transition-colors">
        <div className="flex items-center gap-2">
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="font-bold text-gray-800 text-sm">{year} 年</span>
          <span className="text-xs text-gray-500">（{count} 日）</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600 font-medium">現金 ${$(cashTotal)}</span>
          <span className="text-orange-600 font-medium">八達通 ${$(octopusTotal)}</span>
          <span className="text-blue-700 font-semibold">合計 ${$(total)}</span>
        </div>
      </button>
      {open && <div className="divide-y divide-gray-100">{children}</div>}
    </div>
  );
}

// ====== 月區塊 ======
function MonthBlock({ year, month, total, cashTotal, octopusTotal, count, children }: {
  year: string; month: string; total: number; cashTotal: number; octopusTotal: number; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const monthNames = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="font-medium text-gray-700 text-sm">{monthNames[parseInt(month)]}</span>
          <span className="text-xs text-gray-400">（{count} 日）</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600">現金 ${$(cashTotal)}</span>
          <span className="text-orange-600">八達通 ${$(octopusTotal)}</span>
          <span className="text-blue-600 font-medium">合計 ${$(total)}</span>
        </div>
      </button>
      {open && <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  );
}

// ====== 日區塊（單日結算明細） ======
function DayBlock({ record, online, ePayment, onEdit }: {
  record: any; online: string; ePayment: string; onEdit: (r: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const { can } = usePermission();
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-2 hover:bg-blue-50/50 transition-colors text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <ChevronDown className={`w-3 h-3 text-gray-300 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
          <span className="font-medium text-gray-800">{formatDateWithWeekday(record.settlement_date)}</span>
          <Badge variant={record.source === 'pospal_crawler' ? 'default' : 'secondary'} className="text-[10px] px-1.5">
            {record.source === 'pospal_crawler' ? 'POSPAL' : '手動'}
          </Badge>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span>現金 ${$(record.cash)}</span>
          <span>八達通 ${$(record.octopus)}</span>
          <span className="text-blue-700 font-semibold">合計 ${$(record.total_amount)}</span>
        </div>
      </button>
      {open && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">付款方式明細</span>
            {can('expense.manage') && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(record); }}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Edit2 className="w-3 h-3" /> 載入編輯
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">現金</span><br /><span className="font-medium">${$(record.cash)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">八達通</span><br /><span className="font-medium">${$(record.octopus)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">Foodpanda</span><br /><span className="font-medium">${$(record.foodpanda)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">Payme</span><br /><span className="font-medium">${$(record.payme)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">支付寶香港</span><br /><span className="font-medium">${$(record.alipay_hk)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">WeChat 香港</span><br /><span className="font-medium">${$(record.wechat_hk)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">美團 KEETA</span><br /><span className="font-medium">${$(record.meituan_keeta)}</span></div>
            <div className="bg-white rounded px-2.5 py-1.5 border"><span className="text-gray-500">OpenRice</span><br /><span className="font-medium">${$(record.openrice)}</span></div>
            <div className="col-span-2 sm:col-span-4 bg-blue-50 rounded px-2.5 py-1.5 border border-blue-100">
              <span className="text-blue-700 font-medium">總金額：${$(record.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettlementPage({ embedded }: { embedded?: boolean }) {
  const { can } = usePermission();

  // Settlement State
  const [settlement, setSettlement] = useState<Record<string, string>>({ ...initialSettlement });
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [missingSyncLoading, setMissingSyncLoading] = useState(false);
  const [missingSyncStatus, setMissingSyncStatus] = useState<string | null>(null);

  // History State
  const [settlementHistory, setSettlementHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const [historyRange, setHistoryRange] = useState({ start: thirtyDaysAgo, end: today });

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

  const handleSyncMissingDates = async () => {
    const user = useAuthStore.getState().user;
    const rid = user?.restaurant_id;
    if (!rid) return;
    const existingDates = new Set(settlementHistory.map(r => r.settlement_date));
    const missingDates: string[] = [];
    const start = new Date(historyRange.start);
    const end = new Date(historyRange.end);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (!existingDates.has(ds) && d <= today) missingDates.push(ds);
    }
    if (missingDates.length === 0) {
      setMissingSyncStatus('✅ 範圍內沒有缺失日期');
      return;
    }
    setMissingSyncLoading(true);
    setMissingSyncStatus(`⏳ 正在補抓 ${missingDates.length} 天缺失資料...`);
    let success = 0;
    let failed = 0;
    for (const d of missingDates) {
      try {
        const res = await apiFetch('/api/settlements/sync', {
          method: 'POST',
          body: JSON.stringify({ restaurant_id: rid, date: d }),
        });
        const json = await res.json();
        if (json.success) {
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setMissingSyncStatus(`⏳ 已處理 ${success + failed}/${missingDates.length} 天 (${success} 成功 / ${failed} 失敗)`);
    }
    setMissingSyncStatus(`✅ 補抓完成：${success} 成功 / ${failed} 失敗`);
    setMissingSyncLoading(false);
    await loadSettlementHistory();
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
    });
  };

  return (
    <div className={embedded ? '' : 'p-3 md:p-6'}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">營業額結算</h1>
          <p className="text-sm text-muted-foreground">記錄各項收款來源，或與 POSPAL 系統同步</p>
        </div>
      )}

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-blue-700">📊 總金額</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={settlement.total_amount || ''}
                      onChange={e => setSettlement({ ...settlement, total_amount: e.target.value })} />
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

      {/* ====== 結算歷史紀錄（按年/月分類）====== */}
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> 歷史紀錄</CardTitle>
          <CardDescription>按年/月分類瀏覽每日營業額結算記錄</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 日期範圍篩選 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <DateRangeFilter
              startDate={historyRange.start}
              endDate={historyRange.end}
              onChange={(start, end) => { setHistoryRange({ start, end }); }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncMissingDates}
              disabled={missingSyncLoading}
              className="shrink-0"
            >
              {missingSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              爬回缺失資料
            </Button>
          </div>

          {missingSyncStatus && (
            <div className={`text-sm px-3 py-2 rounded-lg ${missingSyncStatus.startsWith('✅') ? 'bg-green-50 text-green-700' : missingSyncStatus.startsWith('⏳') ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {missingSyncStatus}
            </div>
          )}

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
            <div className="space-y-2">
              {(() => {
                // 按年分組
                const yearMap = new Map<string, any[]>();
                for (const r of settlementHistory) {
                  const year = r.settlement_date.slice(0, 4);
                  if (!yearMap.has(year)) yearMap.set(year, []);
                  yearMap.get(year)!.push(r);
                }
                const years = Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

                return years.map(([year, yearRecords]) => {
                  // 按月分組
                  const monthMap = new Map<string, any[]>();
                  for (const r of yearRecords) {
                    const m = r.settlement_date.slice(5, 7);
                    if (!monthMap.has(m)) monthMap.set(m, []);
                    monthMap.get(m)!.push(r);
                  }
                  const months = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                  const yearTotal = yearRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
                  const yearCash = yearRecords.reduce((s, r) => s + parseFloat(r.cash || 0), 0);
                  const yearOctopus = yearRecords.reduce((s, r) => s + parseFloat(r.octopus || 0), 0);

                  return (
                    <YearBlock
                      key={year}
                      year={year}
                      total={yearTotal}
                      cashTotal={yearCash}
                      octopusTotal={yearOctopus}
                      count={yearRecords.length}
                    >
                      {months.map(([month, monthRecords]) => {
                        const monthTotal = monthRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
                        const monthCash = monthRecords.reduce((s, r) => s + parseFloat(r.cash || 0), 0);
                        const monthOctopus = monthRecords.reduce((s, r) => s + parseFloat(r.octopus || 0), 0);
                        return (
                          <MonthBlock
                            key={month}
                            year={year}
                            month={month}
                            total={monthTotal}
                            cashTotal={monthCash}
                            octopusTotal={monthOctopus}
                            count={monthRecords.length}
                          >
                            {monthRecords.map((record) => {
                              const online = (parseFloat(record.foodpanda || 0) + parseFloat(record.meituan_keeta || 0) + parseFloat(record.openrice || 0)).toFixed(2);
                              const ePayment = (parseFloat(record.alipay_hk || 0) + parseFloat(record.wechat_hk || 0)).toFixed(2);
                              return (
                                <DayBlock
                                  key={record.settlement_date}
                                  record={record}
                                  online={online}
                                  ePayment={ePayment}
                                  onEdit={loadHistoryToForm}
                                />
                              );
                            })}
                          </MonthBlock>
                        );
                      })}
                    </YearBlock>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
