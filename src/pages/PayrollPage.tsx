import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Users, FileText, CheckCircle, Loader2, Download, Plus, Pencil, Trash2 } from 'lucide-react';
import { useEmployees, FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    return typeof obj.message === 'string' ? obj.message : String(err);
  }
  return String(err);
}

export default function PayrollPage() {
  const { can } = usePermission();
  const { employees, loading, refetch, updateEmployee, addEmployee, deleteEmployee } = useEmployees();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'employees' | 'payroll'>('employees');
  const [saving, setSaving] = useState(false);

  // File upload state
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedAttendance[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);

  // Batch create unmatched employees state
  const [showBatchCreate, setShowBatchCreate] = useState(false);
  const [unmatchedBatch, setUnmatchedBatch] = useState<{ name: string; payType: 'hourly' | 'monthly'; hourly_rate: number; monthly_salary: number }[]>([]);
  const [batchCreating, setBatchCreating] = useState(false);

  // Inline message state (replaces alert)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Employee CRUD state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    name: '', phone: '', email: '', role: 'staff' as Employee['role'],
    payType: 'hourly' as 'hourly' | 'monthly',
    hourly_rate: 50, monthly_salary: undefined as number | undefined,
    hire_date: new Date().toISOString().split('T')[0],
  });

  // Show inline message with auto-dismiss
  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ========== Payroll upload logic ==========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
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
      if (records.length === 0) { showMessage('info', '未能解析出任何考勤記錄'); return; }

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

      // 如果發現未匹配員工，顯示批量建立頁面
      if (unmatchedNames.length > 0) {
        setUnmatchedBatch(
          unmatchedNames.map(name => ({
            name,
            payType: 'hourly' as const,
            hourly_rate: 60,
            monthly_salary: 18000,
          }))
        );
        setShowBatchCreate(true);
      }
      showMessage('success', `成功解析 ${merged.length} 筆考勤記錄`);
    } catch (err) {
      console.error('Parsing error:', err);
      showMessage('error', '解析失敗: ' + getErrorMessage(err));
    } finally { setImporting(false); e.target.value = ''; }
  };

  const handleConfirmPayroll = async () => {
    if (parsedData.length === 0) return;
    setSaving(true);
    setMessage(null);
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
      showMessage('success', `✅ 成功寫入 ${parsedData.filter(r => r.matchedEmployee).length} 筆薪資支出`);
      setParsedData([]); setTotalPayroll(0);
    } catch (err) {
      console.error('Payroll confirm error:', err);
      showMessage('error', '寫入失敗: ' + getErrorMessage(err));
    } finally { setSaving(false); }
  };

  // ========== Batch create unmatched employees (via server to bypass RLS) ==========
  const handleBatchCreate = async () => {
    setBatchCreating(true);
    setMessage(null);
    try {
      const user = useAuthStore.getState().user;
      const rid = user?.restaurant_id || FALLBACK_RESTAURANT_ID;

      const response = await fetch('/api/admin/batch-create-employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employees: unmatchedBatch.map(item => ({
            restaurant_id: rid,
            name: item.name,
            payType: item.payType,
            hourly_rate: item.hourly_rate,
            monthly_salary: item.monthly_salary,
          })),
        }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.message || '建立失敗');
      const createdEmployees: Employee[] = result.data;

      // 配對到 parsedData
      const nameToEmp = new Map(createdEmployees.map(e => [e.name, e]));
      const nd = parsedData.map(r =>
        !r.matchedEmployee && nameToEmp.has(r.name)
          ? { ...r, matchedEmployee: nameToEmp.get(r.name)! }
          : r
      );
      setParsedData(nd);
      setTotalPayroll(nd.reduce((s, r) => s + ((r.matchedEmployee?.hourly_rate || 0) * r.hours), 0));
      await refetch();

      setShowBatchCreate(false);
      setUnmatchedBatch([]);
      showMessage('success', `成功建立 ${createdEmployees.length} 位新員工`);
    } catch (err) {
      console.error('Batch create error:', err);
      showMessage('error', '建立失敗: ' + getErrorMessage(err));
    } finally {
      setBatchCreating(false);
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
    setConfirmDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    await deleteEmployee(confirmDelete);
    setConfirmDelete(null);
    showMessage('success', '員工已刪除');
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
            {can('payroll.manage') && (
              <Button onClick={openAddEmployee}>
                <Plus className="h-4 w-4 mr-2" />新增員工
              </Button>
            )}
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
                            {can('payroll.manage') && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => openEditEmployee(emp)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteEmployee(emp.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                              </>
                            )}
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

      {/* ========== 批量建立未匹配員工的全頁面 ========== */}
      {showBatchCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-10">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle className="text-xl">建立新員工</CardTitle>
              <CardDescription>
                考勤表中發現 {unmatchedBatch.length} 位新員工，請設定每位員工的薪資
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 批量員工表格 - 橫向排版 */}
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                {unmatchedBatch.map((item, idx) => (
                  <div key={idx} className="border-b last:border-b-0 py-3 flex items-center gap-4">
                    {/* 序號+姓名 - 固定寬度 */}
                    <div className="flex items-center gap-2 w-24 shrink-0">
                      <span className="bg-primary text-white w-6 h-6 rounded-full text-xs flex items-center justify-center shrink-0">{idx + 1}</span>
                      <span className="font-semibold text-base truncate">{item.name}</span>
                    </div>
                    
                    {/* 工時參考 - 固定寬度 */}
                    <div className="text-sm text-gray-500 w-24 shrink-0">
                      工時 {parsedData.find(r => r.name === item.name)?.hours ?? 0}h
                    </div>
                    
                    {/* 時薪/月薪選擇 - 固定寬度 */}
                    <div className="flex items-center gap-3 w-28 shrink-0">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`payType_${idx}`} checked={item.payType === 'hourly'}
                          onChange={() => {
                            const copy = [...unmatchedBatch];
                            copy[idx] = { ...copy[idx], payType: 'hourly' };
                            setUnmatchedBatch(copy);
                          }} className="accent-primary" />
                        <span className="text-sm">時薪</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`payType_${idx}`} checked={item.payType === 'monthly'}
                          onChange={() => {
                            const copy = [...unmatchedBatch];
                            copy[idx] = { ...copy[idx], payType: 'monthly' };
                            setUnmatchedBatch(copy);
                          }} className="accent-primary" />
                        <span className="text-sm">月薪</span>
                      </label>
                    </div>
                    
                    {/* 薪資輸入 - 固定寬度 */}
                    <div className="w-28 shrink-0">
                      <input
                        type="number"
                        value={item.payType === 'hourly' ? item.hourly_rate : item.monthly_salary}
                        onChange={e => {
                          const v = Number(e.target.value);
                          const copy = [...unmatchedBatch];
                          if (copy[idx].payType === 'hourly') {
                            copy[idx] = { ...copy[idx], hourly_rate: v };
                          } else {
                            copy[idx] = { ...copy[idx], monthly_salary: v };
                          }
                          setUnmatchedBatch(copy);
                        }}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                        placeholder={item.payType === 'hourly' ? '時薪如 60' : '月薪如 18000'}
                      />
                    </div>
                    
                    {/* 月薪估算 - 自動填滿剩餘空間 */}
                    <div className="flex-1 text-sm min-w-0">
                      {item.payType === 'hourly' ? (
                        <span className="text-green-700 font-medium whitespace-nowrap">
                          約 ${((parsedData.find(r => r.name === item.name)?.hours ?? 0) * item.hourly_rate).toLocaleString()}/月
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button variant="outline" onClick={() => {
                  setShowBatchCreate(false);
                  setUnmatchedBatch([]);
                }} disabled={batchCreating}>
                  跳過全部
                </Button>
                <Button onClick={handleBatchCreate} disabled={batchCreating} className="bg-primary">
                  {batchCreating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />建立中...</>
                  ) : (
                    <>全部建立 ({unmatchedBatch.length} 位)</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== 内联消息提示 ========== */}
      {message && (
        <div
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium cursor-pointer max-w-sm transition-all ${
            message.type === 'success' ? 'bg-green-600 text-white' :
            message.type === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'
          }`}
          onClick={() => setMessage(null)}
        >
          {message.text}
        </div>
      )}

      {/* ========== 内联删除确认对话框 ========== */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle>確認刪除</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">確定要刪除此員工？此操作無法復原。</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>確認刪除</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

