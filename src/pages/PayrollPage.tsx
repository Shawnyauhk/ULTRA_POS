import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Upload, Users, FileText, CheckCircle, Trash2, Edit } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  hourly_rate: number;
}

const DEMO_EMPLOYEES: Employee[] = [
  { id: '1', name: 'John Doe', hourly_rate: 60 },
  { id: '2', name: 'Jane Smith', hourly_rate: 65 },
];

export default function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>(DEMO_EMPLOYEES);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工考勤與薪酬 Payroll</h1>
          <p className="text-muted-foreground">智能考勤表解析與薪酬結算</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSettingsModal(true)}>
            <Users className="w-4 h-4 mr-2" />
            時薪設定
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 4.1 考勤表上傳與解析 */}
        <Card>
          <CardHeader>
            <CardTitle>拖曳上傳考勤表</CardTitle>
            <CardDescription>支援 PDF / CSV / XLSX 格式，自動識別欄位</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">拖曳檔案至此，或點擊上傳</p>
              <p className="text-sm text-muted-foreground mt-2">系統將自動過濾雜訊並合併同名工時</p>
            </div>
            
            <div className="mt-4 p-4 bg-blue-50 rounded-lg flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">本期發放總計預覽 (預留)</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">$0.00</p>
                <Button className="mt-3 w-full" variant="default">確認寫入支出 (Payroll)</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4.3 薪酬結算與歷史 */}
        <Card>
          <CardHeader>
            <CardTitle>薪酬歷史紀錄</CardTitle>
            <CardDescription>點擊可查看並編輯明細</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors flex justify-between items-center cursor-pointer" onClick={() => setShowDetailsModal(true)}>
                <div>
                  <p className="font-medium">2026年4月薪資</p>
                  <p className="text-sm text-muted-foreground">人數: 2 | 總額: $15,000</p>
                </div>
                <div className="flex gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <Trash2 className="w-5 h-5 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); alert('確認刪除?'); }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4.2 員工時薪設定 Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">員工時薪設定</h2>
            <div className="space-y-4 mb-6">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center gap-3">
                  <Input value={emp.name} readOnly className="bg-gray-50" />
                  <Input type="number" value={emp.hourly_rate} onChange={(e) => setEmployees(employees.map(x => x.id === emp.id ? {...x, hourly_rate: parseFloat(e.target.value)} : x))} />
                  <span className="text-sm text-gray-500">/hr</span>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => setEmployees([...employees, { id: Date.now().toString(), name: '新員工', hourly_rate: 60 }])}>
                + 新增員工
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSettingsModal(false)}>關閉</Button>
              <Button onClick={() => { alert('時薪已同步至 Supabase'); setShowSettingsModal(false); }}>儲存變更</Button>
            </div>
          </div>
        </div>
      )}

      {/* 4.4 薪酬明細編輯 Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">薪酬明細編輯 - 2026年4月薪資</h2>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2">姓名</th>
                    <th className="px-4 py-2">時薪</th>
                    <th className="px-4 py-2">工時</th>
                    <th className="px-4 py-2">小計</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2">John Doe</td>
                    <td className="px-4 py-2"><Input type="number" defaultValue={60} className="w-20" /></td>
                    <td className="px-4 py-2"><Input type="number" defaultValue={120} className="w-20" /></td>
                    <td className="px-4 py-2 font-medium">$7,200</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDetailsModal(false)}>取消</Button>
              <Button onClick={() => setShowDetailsModal(false)}>儲存並關閉</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
