import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Users, FileText, CheckCircle, Loader2, Download, Plus, Pencil, Trash2 } from 'lucide-react';
import { useEmployees, FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import * as XLSX from 'xlsx';
import type { Employee } from '@/types';

interface ParsedAttendance {
  name: string;
  hours: number;
  matchedEmployee?: Employee;
}

const roleLabels: Record<string, string> = {
  owner: '店主',
  manager: '主管',
  staff: '員工',
};

export default function PayrollPage() {
  const { employees, loading, refetch, updateEmployee, addEmployee, deleteEmployee } = useEmployees();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'employees' | 'payroll'>('employees');
  const [saving, setSaving] = useState(false);

  // File upload state
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedAttendance[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);

  // Quick-create modal state
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [quickCreateQueue, setQuickCreateQueue] = useState<string[]>([]);
  const [quickPayType, setQuickPayType] = useState<'hourly' | 'monthly'>('hourly');
  const [quickRate, setQuickRate] = useState(60);
  const [quickMonthly, setQuickMonthly] = useState(18000);
  const [quickCreating, setQuickCreating] = useState(false);

  // Employee CRUD state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    name: '', phone: '', email: '', role: 'staff' as Employee['role'],
    payType: 'hourly' as 'hourly' | 'monthly',
    hourly_rate: 50, monthly_salary: undefined as number | undefined,
    hire_date: new Date().toISOString().split('T')[0],
  });

  // ========== Payroll upload logic ==========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let records: { name: string; hours: number }[] = [];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        if (jsonRows.length > 0) {
          const headers = Object.keys(jsonRows[0]);
          const nameCol = headers.find(h => /姓名|name|員工|employee|名字|人員/i.test(h));
          const hoursCol = headers.find(h => /工時|時數|hours|hour|工作時數|出勤天數/i.test(h));
          if (nameCol && hoursCol) {
            records = jsonRows.map(r => ({
              name: String(r[nameCol] || '').trim(),
              hours: parseFloat(String(r[hoursCol] || '0')) || 0,
            })).filter(r => r.name && r.name.length >= 1);
          } else {
            const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            for (const row of rawRows) {
              if (!row || row.length < 2) continue;
              const first = String(row[0] || '').trim();
              if (!first || /^(序號|no|編號|id|姓名|name|工號)/i.test(first) ||
                  /^(合計|總計|小計|total|sum|avg|平均)/i.test(first)) continue;
              let hours = 0;
              for (let i = 1; i < Math.min(row.length, 6); i++) {
                const val = parseFloat(String(row[i] || '0').replace(/[^0-9.]/g, ''));
                if (!isNaN(val) && val > 0 && val <= 744) { hours = val; break; }
              }
              if (first && hours > 0) records.push({ name: first, hours });
            }
          }
        }
      } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve) => {
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        const response = await fetch('/api/nvidia/v1/chat/completions', {
          method: 'POST', headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_NVIDIA_NIM_API_KEY}`,
          },
          body: JSON.stringify({
            model: import.meta.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
            messages: [{
              role: 'user', content: [
                { type: 'image_url', image_url: { url: fileData } },
                { type: 'text', text: `你是一個考勤表識別助手。請分析這張圖片/PDF中的員工考勤資料。
請以 JSON 陣列格式回覆，每個項目包含：
{"name": "員工姓名", "hours": 工時（數字）}
範例：[{"name": "張三", "hours": 160}, {"name": "李四", "hours": 152}]
只輸出員工資料，不要包含標題行、合計行。只回覆 JSON 陣列。` }
              ]
            }], max_tokens: 2048, temperature: 0.1
          })
        });
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        const apiData = await response.json();
        const text = apiData.choices?.[0]?.message?.reasoning_content || apiData.choices?.[0]?.message?.content || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('無法解析 AI 回覆');
        records = JSON.parse(jsonMatch[0]);
      }
      if (records.length === 0) { alert('未能解析出任何考勤記錄'); return; }

      // 依姓名匯總工時
      const grouped = new Map<string, number>();
      for (const r of records) {
        const name = r.name.trim();
        grouped.set(name, (grouped.get(name) || 0) + r.hours);
      }

      // 建立 ParsedAttendance（每人一筆）
      const merged: ParsedAttendance[] = [];
      const unmatchedNames: string[] = [];
      for (const [name, totalHours] of grouped) {
        let emp = employees.find(e => e.name === name);
        if (!emp) { const c = name.replace(/[\s　,，、]/g, ''); emp = employees.find(e => e.name.replace(/[\s　,，、]/g, '') === c); }
        if (!emp) emp = employees.find(e => name.includes(e.name) || e.name.includes(name));
        merged.push({ name, hours: Math.round(totalHours * 100) / 100, matchedEmployee: emp || undefined });
        if (!emp) unmatchedNames.push(name);
      }

      setParsedData(merged);
      setTotalPayroll(merged.reduce((s, r) => s + ((r.matchedEmployee?.hourly_rate || 0) * r.hours), 0));

      // 自動彈出未匹配員工的建立表單
      if (unmatchedNames.length > 0) {
        setQuickCreateName(unmatchedNames[0]);
        setQuickCreateQueue(unmatchedNames.slice(1));
        setShowQuickCreate(true);
      }
    } catch (err) { console.error('Parsing error:', err); alert('解析失敗: ' + (err as Error).message);
    } finally { setImporting(false); e.target.value = ''; }
  };

  const handleConfirmPayroll = async () => {
    if (parsedData.length === 0) return;
    setSaving(true);
    try {
      for (const record of parsedData) {
        if (!record.matchedEmployee) continue;
        const expenseAmount = (record.matchedEmployee.hourly_rate || 0) * record.hours;
        const { error } = await supabase.from('expenses').insert([{
          restaurant_id: record.matchedEmployee.restaurant_id, category: 'salary',
          amount: expenseAmount,
          description: `${record.matchedEmployee.name} 考勤薪資 (${record.hours}h × $${record.matchedEmployee.hourly_rate || 0}/hr)`,
          expense_date: new Date().toISOString().split('T')[0],
        }]);
        if (error) throw error;
      }
      alert(`✅ 成功寫入 ${parsedData.filter(r => r.matchedEmployee).length} 筆薪資支出`);
      setParsedData([]); setTotalPayroll(0);
    } catch (err) { console.error('Payroll confirm error:', err); alert('寫入失敗: ' + (err as Error).message);
    } finally { setSaving(false); }
  };

  // ========== Quick create employee handler ==========
  const handleQuickCreate = async () => {
    setQuickCreating(true);
    try {
      const user = useAuthStore.getState().user;
      const rid = user?.restaurant_id || FALLBACK_RESTAURANT_ID;
      const { data, error } = await supabase
        .from('employees')
        .insert([{
          restaurant_id: rid, name: quickCreateName, role: 'staff',
          hire_date: new Date().toISOString().split('T')[0], is_active: true,
          hourly_rate: quickPayType === 'hourly' ? quickRate : undefined,
          monthly_salary: quickPayType === 'monthly' ? quickMonthly : undefined,
        }])
        .select()
        .single();
      if (error) throw error;

      // 配對到 parsedData
      const nd = parsedData.map(r =>
        r.name === quickCreateName && !r.matchedEmployee
          ? { ...r, matchedEmployee: data as Employee }
          : r
      );
      setParsedData(nd);
      setTotalPayroll(nd.reduce((s, r) => s + ((r.matchedEmployee?.hourly_rate || 0) * r.hours), 0));
      await refetch(); // 更新員工列表

      // 處理下一個未匹配
      if (quickCreateQueue.length > 0) {
        setQuickCreateName(quickCreateQueue[0]);
        setQuickCreateQueue(prev => prev.slice(1));
        setQuickPayType('hourly');
        setQuickRate(60);
        setQuickMonthly(18000);
        // 保持 modal 開啟
      } else {
        setShowQuickCreate(false);
        setQuickCreateName('');
      }
    } catch (err) {
      console.error('Quick create error:', err);
      alert('建立失敗: ' + (err as Error).message);
    } finally {
      setQuickCreating(false);
    }
  };

  // ========== Employee CRUD logic ==========
  const resetEmpForm = () => setEmpForm({
    name: '', phone: '', email: '', role: 'staff', payType: 'hourly',
    hourly_rate: 50, monthly_salary: undefined,
    hire_date: new Date().toISOString().split('T')[0],
  });

  const openAddEmployee = () => { resetEmpForm(); setEditingEmployee(null); setShowEmployeeModal(true); };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpForm({
      name: emp.name, phone: emp.phone || '', email: emp.email || '', role: emp.role,
      payType: emp.hourly_rate ? 'hourly' : 'monthly',
      hourly_rate: emp.hourly_rate || 50, monthly_salary: emp.monthly_salary || undefined,
      hire_date: emp.hire_date.split('T')[0],
    });
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const data = {
      name: empForm.name, phone: empForm.phone || undefined, email: empForm.email || undefined,
      role: empForm.role,
      hourly_rate: empForm.payType === 'hourly' ? empForm.hourly_rate : undefined,
      monthly_salary: empForm.payType === 'monthly' ? (empForm.monthly_salary || 0) : undefined,
      hire_date: empForm.hire_date,
    };
    if (editingEmployee) { await updateEmployee(editingEmployee.id, data); }
    else { await addEmployee(data as any); }
    setSaving(false); setShowEmployeeModal(false); setEditingEmployee(null); resetEmpForm();
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('確定要刪除此員工？')) return;
    await deleteEmployee(id);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 頁面標題 + Tab切換 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工與薪酬</h1>
          <p className="text-muted-foreground">員工資料管理與智能薪酬結算</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <Button variant={activeTab === 'employees' ? 'default' : 'ghost'} onClick={() => setActiveTab('employees')}>
            <Users className="w-4 h-4 mr-2" />員工資料
          </Button>
          <Button variant={activeTab === 'payroll' ? 'default' : 'ghost'} onClick={() => setActiveTab('payroll')}>
            <FileText className="w-4 h-4 mr-2" />薪酬結算
          </Button>
        </div>
      </div>

      {activeTab === 'employees' ? (
        /* ==================== 員工資料管理 ==================== */
        <div className="space-y-6 animate-in fade-in">
          <div className="flex justify-end">
            <Button onClick={openAddEmployee}>
              <Plus className="h-4 w-4 mr-2" />新增員工
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>暫無員工資料，請點擊上方新增員工</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>聯絡</TableHead>
                      <TableHead>職位</TableHead>
                      <TableHead>薪資</TableHead>
                      <TableHead>入職</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(emp => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>
                          <div className="text-sm">{emp.phone && <div>{emp.phone}</div>}{emp.email && <div className="text-gray-500">{emp.email}</div>}</div>
                        </TableCell>
                        <TableCell><Badge variant={emp.role === 'owner' ? 'default' : 'secondary'}>{roleLabels[emp.role]}</Badge></TableCell>
                        <TableCell>{emp.monthly_salary ? `$${emp.monthly_salary.toLocaleString()}/月` : `$${emp.hourly_rate}/小時`}</TableCell>
                        <TableCell>{emp.hire_date}</TableCell>
                        <TableCell><Badge variant={emp.is_active ? 'success' : 'destructive'}>{emp.is_active ? '在職' : '離職'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditEmployee(emp)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteEmployee(emp.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 新增/編輯員工 Modal */}
          {showEmployeeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <Card className="w-full max-w-md mx-4">
                <CardHeader><CardTitle>{editingEmployee ? '編輯員工' : '新增員工'}</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveEmployee} className="space-y-4">
                    <div><label className="text-sm font-medium">姓名</label><Input value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-sm font-medium">電話</label><Input value={empForm.phone} onChange={e => setEmpForm({...empForm, phone: e.target.value})} /></div>
                      <div><label className="text-sm font-medium">電郵</label><Input type="email" value={empForm.email} onChange={e => setEmpForm({...empForm, email: e.target.value})} /></div>
                    </div>
                    <div><label className="text-sm font-medium">職位</label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={empForm.role}
                        onChange={e => setEmpForm({...empForm, role: e.target.value as Employee['role']})}>
                        <option value="owner">店主</option><option value="manager">主管</option><option value="staff">員工</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">薪資類型</label>
                      <div className="flex gap-4 mb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="payType" value="hourly" checked={empForm.payType === 'hourly'}
                            onChange={() => setEmpForm({...empForm, payType: 'hourly'})} className="accent-primary" />
                          <span className="text-sm">時薪</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="payType" value="monthly" checked={empForm.payType === 'monthly'}
                            onChange={() => setEmpForm({...empForm, payType: 'monthly'})} className="accent-primary" />
                          <span className="text-sm">月薪</span>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">{empForm.payType === 'hourly' ? '時薪 ($/hr)' : '月薪 ($/月)'}</label>
                        <Input type="number"
                          value={empForm.payType === 'hourly' ? empForm.hourly_rate : (empForm.monthly_salary || 0)}
                          onChange={e => {
                            const v = Number(e.target.value);
                            empForm.payType === 'hourly'
                              ? setEmpForm({...empForm, hourly_rate: v})
                              : setEmpForm({...empForm, monthly_salary: v});
                          }} />
                      </div>
                      <div><label className="text-sm font-medium">入職日期</label><Input type="date" value={empForm.hire_date} onChange={e => setEmpForm({...empForm, hire_date: e.target.value})} required /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setShowEmployeeModal(false)}>取消</Button>
                      <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editingEmployee ? '儲存' : '新增'}</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : (
        /* ==================== 薪酬結算 ==================== */
        <div className="animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 考勤表上傳與解析 */}
            <Card>
              <CardHeader>
                <CardTitle>拖曳上傳考勤表</CardTitle>
                <CardDescription>支援 EXCEL (.xlsx, .csv)、PDF、圖片 (jpg, png)</CardDescription>
              </CardHeader>
              <CardContent>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv,image/*,.pdf" onChange={handleFileUpload} />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors" onClick={() => fileInputRef.current?.click()}>
                  {importing ? (
                    <div className="flex flex-col items-center"><Loader2 className="w-12 h-12 animate-spin text-primary mb-4" /><p className="text-lg font-medium">AI 正在解析考勤表...</p></div>
                  ) : (
                    <><Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><p className="text-lg font-medium">點擊或拖曳檔案至此</p><p className="text-sm text-muted-foreground mt-2">Excel 直接解析；圖片/PDF 由 NVIDIA AI 識別</p></>
                  )}
                </div>
                {parsedData.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-3">解析結果</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {parsedData.map((r, i) => (
                          <div key={i} className="flex items-center justify-between bg-white rounded p-2.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-medium text-sm shrink-0">{r.name}</span>
                              {r.matchedEmployee ? (
                                <Badge variant="success" className="text-[10px] shrink-0">✓ {r.matchedEmployee.name}</Badge>
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge variant="warning" className="text-[10px]">⚠ 未匹配</Badge>
                                  <select className="text-[10px] border rounded px-1 py-0.5 max-w-[80px]" value=""
                                    onChange={(e) => {
                                      if (!e.target.value) return;
                                      const nd = [...parsedData]; const emp = employees.find(e2 => e2.id === e.target.value);
                                      nd[i] = { ...r, matchedEmployee: emp }; setParsedData(nd);
                                      setTotalPayroll(nd.reduce((s, item) => s + ((item.matchedEmployee?.hourly_rate || 0) * item.hours), 0));
                                    }}>
                                    <option value="">配對...</option>
                                    {employees.filter(e => e.role === 'staff').map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                            <div className="text-sm shrink-0 ml-2">
                              <span className="text-gray-500">{r.hours}h × </span>
                              {r.matchedEmployee ? (
                                <><span className="font-medium">${r.matchedEmployee.hourly_rate || 0}/hr</span><span className="ml-2 text-primary font-bold"> = ${((r.matchedEmployee.hourly_rate || 0) * r.hours).toLocaleString()}</span></>
                              ) : (<span className="text-gray-400">待配對</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div><p className="font-medium text-green-900">本期發放總計</p><p className="text-2xl font-bold text-green-700 mt-1">${totalPayroll.toLocaleString()}</p></div>
                        <Button onClick={handleConfirmPayroll} disabled={saving || parsedData.length === 0} className="bg-green-600 hover:bg-green-700">
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}確認寫入支出
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 薪酬歷史 */}
            <Card>
              <CardHeader><CardTitle>薪酬歷史紀錄</CardTitle><CardDescription>點擊查看明細</CardDescription></CardHeader>
              <CardContent>
                <div className="p-4 border rounded-lg flex justify-between items-center">
                  <div><p className="font-medium">2026年5月薪資</p><p className="text-sm text-muted-foreground">員工: {employees.length} 人 | 等待結算</p></div>
                  <CheckCircle className="w-5 h-5 text-gray-300" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ========== 快速建立未匹配員工 Modal ========== */}
      {showQuickCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle className="text-lg">建立新員工</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  考勤表中發現新員工「<strong>{quickCreateName}</strong>」，
                  {quickCreateQueue.length > 0 ? `還有 ${quickCreateQueue.length} 位待建立。` : '請輸入薪資即可完成建檔。'}
                </p>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="qcPayType" checked={quickPayType === 'hourly'}
                    onChange={() => setQuickPayType('hourly')} className="accent-primary" />
                  <span className="text-sm">時薪</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="qcPayType" checked={quickPayType === 'monthly'}
                    onChange={() => setQuickPayType('monthly')} className="accent-primary" />
                  <span className="text-sm">月薪</span>
                </label>
              </div>

              <Input
                type="number"
                value={quickPayType === 'hourly' ? quickRate : quickMonthly}
                onChange={e => {
                  const v = Number(e.target.value);
                  quickPayType === 'hourly' ? setQuickRate(v) : setQuickMonthly(v);
                }}
                placeholder={quickPayType === 'hourly' ? '時薪 (如 60)' : '月薪 (如 18000)'}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => {
                  // 跳過此員工
                  if (quickCreateQueue.length > 0) {
                    setQuickCreateName(quickCreateQueue[0]);
                    setQuickCreateQueue(prev => prev.slice(1));
                    setQuickPayType('hourly'); setQuickRate(60); setQuickMonthly(18000);
                  } else {
                    setShowQuickCreate(false);
                  }
                }} disabled={quickCreating}>
                  跳過
                </Button>
                <Button onClick={handleQuickCreate} disabled={quickCreating}>
                  {quickCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {quickCreateQueue.length > 0 ? '建立並繼續下一位' : '建立'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

