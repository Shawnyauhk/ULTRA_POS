import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Key, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useEmployees } from '@/hooks/useSupabaseData'
import { usePermission } from '@/hooks/usePermission'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types'

const roleLabels: Record<string, string> = {
  owner: '店主',
  manager: '主管',
  staff: '員工',
}

export function EmployeesPage() {
  const { user } = useAuthStore()
  const { can } = usePermission()
  const { employees, loading, refetch, addEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'staff' as Employee['role'],
    hourly_rate: 50,
    monthly_salary: undefined as number | undefined,
    hire_date: new Date().toISOString().split('T')[0],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const empData = {
      name: formData.name,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      role: formData.role,
      hourly_rate: formData.role === 'staff' ? formData.hourly_rate : undefined,
      monthly_salary: formData.role !== 'staff' ? (formData.monthly_salary || 0) : undefined,
      hire_date: formData.hire_date,
    }

    if (editingEmployee) {
      const ok = await updateEmployee(editingEmployee.id, empData)
      if (ok && formData.password && can('employee.manage')) {
        await supabase.rpc('update_auth_password', {
          p_phone: formData.phone,
          p_password: formData.password,
        })
      }
    } else {
      const newEmp = await addEmployee(empData)
      if (newEmp && formData.password && can('employee.manage')) {
        await supabase.rpc('update_auth_password', {
          p_phone: formData.phone,
          p_password: formData.password,
        })
      }
    }
    setSaving(false)
    setShowModal(false)
    setEditingEmployee(null)
    resetForm()
  }

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      name: employee.name,
      phone: employee.phone || '',
      email: employee.email || '',
      password: '',
      role: employee.role,
      hourly_rate: employee.hourly_rate || 50,
      monthly_salary: employee.monthly_salary || undefined,
      hire_date: employee.hire_date.split('T')[0],
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除此員工嗎？')) {
      const result = await deleteEmployee(id)
      if (!result) {
        alert('刪除失敗，請確認權限或稍後重試')
      }
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'staff',
      hourly_rate: 50,
      monthly_salary: undefined,
      hire_date: new Date().toISOString().split('T')[0],
    })
  }

  const openAddModal = () => {
    resetForm()
    setEditingEmployee(null)
    setShowModal(true)
  }

  if (!can('employee.view')) {
    return <div className="p-6 text-center text-gray-500">您沒有權限訪問此頁面</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">員工管理</h1>
          <p className="text-gray-500 mt-1">管理餐廳員工資料</p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4 mr-2" />
          新增員工
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>聯絡</TableHead>
                <TableHead>職位</TableHead>
                <TableHead>薪資</TableHead>
                <TableHead>入職日期</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {employee.phone && <div>{employee.phone}</div>}
                      {employee.email && <div className="text-gray-500">{employee.email}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.role === 'owner' ? 'default' : 'secondary'}>
                      {roleLabels[employee.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {employee.monthly_salary
                      ? `$${employee.monthly_salary.toLocaleString()}/月`
                      : `$${employee.hourly_rate}/小時`
                    }
                  </TableCell>
                  <TableCell>{employee.hire_date}</TableCell>
                  <TableCell>
                    <Badge variant={employee.is_active ? 'success' : 'destructive'}>
                      {employee.is_active ? '在職' : '離職'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(employee)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(employee.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingEmployee ? '編輯員工' : '新增員工'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">姓名</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">電話</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">電郵</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">職位</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Employee['role'] })}
                  >
                    <option value="owner">店主</option>
                    <option value="manager">主管</option>
                    <option value="staff">員工</option>
                  </select>
                </div>

                {can('employee.manage') && (
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Key className="h-3.5 w-3.5" />
                      {editingEmployee ? '重置密碼（留空不變）' : '登入密碼'}
                    </label>
                    <Input
                      type="password"
                      placeholder={editingEmployee ? '輸入新密碼...' : '預設 123456'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      {formData.role === 'staff' ? '時薪 ($)' : '月薪 ($)'}
                    </label>
                    <Input
                      type="number"
                      value={formData.role === 'staff' ? formData.hourly_rate : (formData.monthly_salary || 0)}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        if (formData.role === 'staff') {
                          setFormData({ ...formData, hourly_rate: val })
                        } else {
                          setFormData({ ...formData, monthly_salary: val })
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">入職日期</label>
                    <Input
                      type="date"
                      value={formData.hire_date}
                      onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                    取消
                  </Button>
                  <Button type="submit">{editingEmployee ? '儲存' : '新增'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
