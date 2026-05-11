import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Check, X, Clock, Package, AlertTriangle, ShoppingCart, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrderRequest, Inventory, Employee } from '@/types'

const statusConfig = {
  pending: { label: '待審批', variant: 'warning' as const, icon: Clock },
  approved: { label: '已批准', variant: 'default' as const, icon: Check },
  rejected: { label: '已拒絕', variant: 'destructive' as const, icon: X },
  ordered: { label: '已訂貨', variant: 'default' as const, icon: ShoppingCart },
  partial: { label: '部分收貨', variant: 'warning' as const, icon: Package },
  received: { label: '已完成', variant: 'success' as const, icon: CheckCircle },
}

export function OrderRequestsPage() {
  const [requests, setRequests] = useState<OrderRequest[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [activeTab, setActiveTab] = useState<'staff' | 'admin' | 'receipt'>('staff')
  const [showNewRequestModal, setShowNewRequestModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<OrderRequest | null>(null)
  const [selectedItems, setSelectedItems] = useState<{ inventory_id: string; quantity: number }[]>([])
  const [notes, setNotes] = useState('')
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, number>>({})

  useEffect(() => {
    // Demo data
    setEmployees([
      { id: '1', restaurant_id: 'demo', name: '張三', role: 'owner', hire_date: '2024-01-01', is_active: true, created_at: '2024-01-01' },
      { id: '2', restaurant_id: 'demo', name: '李四', role: 'manager', hire_date: '2024-03-15', is_active: true, created_at: '2024-03-15' },
    ])
    setInventory([
      { id: '1', restaurant_id: 'demo', category: '糖水配料', name: '黑糖粉條', unit: '包', current_stock: 5, min_stock_level: 20, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '2', restaurant_id: 'demo', category: '茶用品', name: '鴨屎香茶葉', unit: '包', current_stock: 3, min_stock_level: 5, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '3', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '單杯袋', unit: '個', current_stock: 50, min_stock_level: 500, last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
    ])
    setRequests([
      {
        id: '1',
        restaurant_id: 'demo',
        requested_by: '1',
        status: 'pending',
        notes: '急需補充，黑糖粉條快用完了',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        employee: { id: '1', restaurant_id: 'demo', name: '張三', role: 'owner', hire_date: '2024-01-01', is_active: true, created_at: '2024-01-01' },
        items: [
          { id: '1', order_request_id: '1', inventory_id: '1', requested_quantity: 50, created_at: new Date().toISOString(), inventory: { id: '1', restaurant_id: 'demo', category: '糖水配料', name: '黑糖粉條', unit: '包', current_stock: 5, min_stock_level: 20, last_updated: new Date().toISOString(), created_at: new Date().toISOString() } },
          { id: '2', order_request_id: '1', inventory_id: '3', requested_quantity: 1000, created_at: new Date().toISOString(), inventory: { id: '3', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '單杯袋', unit: '個', current_stock: 50, min_stock_level: 500, last_updated: new Date().toISOString(), created_at: new Date().toISOString() } },
        ],
      },
      {
        id: '2',
        restaurant_id: 'demo',
        requested_by: '1',
        status: 'ordered',
        notes: '已聯繫供應商，明日送貨',
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date().toISOString(),
        employee: { id: '1', restaurant_id: 'demo', name: '張三', role: 'owner', hire_date: '2024-01-01', is_active: true, created_at: '2024-01-01' },
        items: [
          { id: '3', order_request_id: '2', inventory_id: '2', requested_quantity: 20, approved_quantity: 15, created_at: new Date().toISOString(), inventory: { id: '2', restaurant_id: 'demo', category: '茶用品', name: '鴨屎香茶葉', unit: '包', current_stock: 3, min_stock_level: 5, last_updated: new Date().toISOString(), created_at: new Date().toISOString() } },
        ],
      },
    ])
  }, [])

  // Staff: Create new order request
  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault()
    const newRequest: OrderRequest = {
      id: Date.now().toString(),
      restaurant_id: 'demo',
      requested_by: '1', // Current user
      status: 'pending',
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      employee: employees.find(e => e.id === '1'),
      items: selectedItems.map(item => ({
        id: Date.now().toString() + Math.random(),
        order_request_id: '',
        inventory_id: item.inventory_id,
        requested_quantity: item.quantity,
        created_at: new Date().toISOString(),
        inventory: inventory.find(i => i.id === item.inventory_id),
      })),
    }
    setRequests([...requests, newRequest])
    setShowNewRequestModal(false)
    setSelectedItems([])
    setNotes('')
  }

  const addItemToRequest = (inv: Inventory) => {
    if (selectedItems.find(i => i.inventory_id === inv.id)) return
    setSelectedItems([...selectedItems, { inventory_id: inv.id, quantity: inv.min_stock_level - inv.current_stock }])
  }

  const updateItemQuantity = (invId: string, qty: number) => {
    setSelectedItems(selectedItems.map(i => i.inventory_id === invId ? { ...i, quantity: qty } : i))
  }

  // Admin: Approve/Reject order
  const handleApprove = (requestId: string) => {
    setRequests(requests.map(r => r.id === requestId ? { ...r, status: 'ordered' as const, updated_at: new Date().toISOString() } : r))
  }

  const handleReject = (requestId: string) => {
    setRequests(requests.map(r => r.id === requestId ? { ...r, status: 'rejected' as const, updated_at: new Date().toISOString() } : r))
  }

  // Receipt: Confirm goods
  const openReceiptModal = (request: OrderRequest) => {
    void request // TODO: Implement receipt modal
    setSelectedRequest(request)
    const initial: Record<string, number> = {}
    request.items?.forEach(item => {
      initial[item.inventory_id] = item.approved_quantity || item.requested_quantity
    })
    setReceiptQuantities(initial)
    setShowReceiptModal(true)
  }

  const handleReceiptConfirm = () => {
    if (!selectedRequest) return
    // Update inventory
    const updatedInventory = [...inventory]
    selectedRequest.items?.forEach(item => {
      const inv = updatedInventory.find(i => i.id === item.inventory_id)
      if (inv) {
        inv.current_stock += receiptQuantities[item.inventory_id] || 0
      }
    })
    setInventory(updatedInventory)

    // Update request status
    const allReceived = selectedRequest.items?.every(item =>
      receiptQuantities[item.inventory_id] >= (item.approved_quantity || item.requested_quantity)
    )
    const someReceived = selectedRequest.items?.some(item =>
      receiptQuantities[item.inventory_id] > 0
    )
    setRequests(requests.map(r => r.id === selectedRequest.id ? {
      ...r,
      status: allReceived ? 'received' as const : someReceived ? 'partial' as const : r.status,
      updated_at: new Date().toISOString(),
    } : r))

    setShowReceiptModal(false)
    setSelectedRequest(null)
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const orderedRequests = requests.filter(r => ['ordered', 'partial'].includes(r.status))
  const completedRequests = requests.filter(r => r.status === 'received')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">訂貨管理</h1>
          <p className="text-gray-500 mt-1">三階段：員工請求 → 管理員審批 → 收貨確認</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={cn('px-4 py-2 font-medium border-b-2 transition-colors', activeTab === 'staff' ? 'border-primary text-primary' : 'border-transparent text-gray-500')}
          onClick={() => setActiveTab('staff')}
        >
          <Plus className="h-4 w-4 inline mr-1" />
          員工請求 ({pendingRequests.length})
        </button>
        <button
          className={cn('px-4 py-2 font-medium border-b-2 transition-colors', activeTab === 'admin' ? 'border-primary text-primary' : 'border-transparent text-gray-500')}
          onClick={() => setActiveTab('admin')}
        >
          <Clock className="h-4 w-4 inline mr-1" />
          待處理 ({orderedRequests.length})
        </button>
        <button
          className={cn('px-4 py-2 font-medium border-b-2 transition-colors', activeTab === 'receipt' ? 'border-primary text-primary' : 'border-transparent text-gray-500')}
          onClick={() => setActiveTab('receipt')}
        >
          <CheckCircle className="h-4 w-4 inline mr-1" />
          已完成 ({completedRequests.length})
        </button>
      </div>

      {/* Staff Tab */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>提出訂貨請求</CardTitle>
                <CardDescription>選擇需要訂貨的貨物</CardDescription>
              </div>
              <Button onClick={() => setShowNewRequestModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新增請求
              </Button>
            </CardHeader>
            <CardContent>
              {/* Low stock items quick add */}
              <div className="mb-4">
                <p className="text-sm font-medium text-yellow-600 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  庫存不足的貨物（快速加入）：
                </p>
                <div className="flex flex-wrap gap-2">
                  {inventory.filter(i => i.current_stock < i.min_stock_level).map(inv => (
                    <Button key={inv.id} variant="outline" size="sm" onClick={() => addItemToRequest(inv)}>
                      {inv.name} ({inv.current_stock}/{inv.min_stock_level}{inv.unit})
                    </Button>
                  ))}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>貨物名稱</TableHead>
                    <TableHead>類別</TableHead>
                    <TableHead>現有庫存</TableHead>
                    <TableHead>最低庫存</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map(inv => (
                    <TableRow key={inv.id} className={inv.current_stock < inv.min_stock_level ? 'bg-yellow-50' : ''}>
                      <TableCell className="font-medium">{inv.name}</TableCell>
                      <TableCell><Badge variant="secondary">{inv.category}</Badge></TableCell>
                      <TableCell className={inv.current_stock < inv.min_stock_level ? 'text-yellow-600 font-medium' : ''}>
                        {inv.current_stock} {inv.unit}
                      </TableCell>
                      <TableCell>{inv.min_stock_level} {inv.unit}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => addItemToRequest(inv)}>
                          <Plus className="h-4 w-4 mr-1" />
                          加入
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Requests */}
          <Card>
            <CardHeader>
              <CardTitle>我的請求記錄</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>請求編號</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>備註</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">#{req.id.slice(0, 8)}</TableCell>
                      <TableCell>{new Date(req.created_at).toLocaleDateString('zh-HK')}</TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[req.status].variant}>
                          {statusConfig[req.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">{req.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Tab */}
      {activeTab === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>待處理訂貨</CardTitle>
            <CardDescription>批准或拒絕員工的訂貨請求</CardDescription>
          </CardHeader>
          <CardContent>
            {orderedRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">沒有待處理的訂貨</p>
            ) : (
              <div className="space-y-4">
                {orderedRequests.map(req => (
                  <div key={req.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium">訂貨 #{req.id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-500">
                          申請人：{req.employee?.name} | {new Date(req.created_at).toLocaleDateString('zh-HK')}
                        </p>
                      </div>
                      <Badge variant={statusConfig[req.status].variant}>
                        {statusConfig[req.status].label}
                      </Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>貨物</TableHead>
                          <TableHead>申請數量</TableHead>
                          <TableHead>批准數量</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {req.items?.map(item => (
                          <TableRow key={item.id}>
                            <TableCell>{item.inventory?.name}</TableCell>
                            <TableCell>{item.requested_quantity} {item.inventory?.unit}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-24"
                                defaultValue={item.approved_quantity || item.requested_quantity}
                                disabled
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" onClick={() => handleReject(req.id)}>
                        <X className="h-4 w-4 mr-1" />
                        拒絕
                      </Button>
                      <Button onClick={() => handleApprove(req.id)}>
                        <Check className="h-4 w-4 mr-1" />
                        確認收貨
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completed Tab */}
      {activeTab === 'receipt' && (
        <Card>
          <CardHeader>
            <CardTitle>已完成記錄</CardTitle>
          </CardHeader>
          <CardContent>
            {completedRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">沒有完成的記錄</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>請求編號</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>詳情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedRequests.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">#{req.id.slice(0, 8)}</TableCell>
                      <TableCell>{new Date(req.created_at).toLocaleDateString('zh-HK')}</TableCell>
                      <TableCell><Badge variant="success">已完成</Badge></TableCell>
                      <TableCell className="text-gray-500">
                        {req.items?.map(i => `${i.inventory?.name} x${i.received_quantity || i.approved_quantity}`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Request Modal */}
      {showNewRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>新增訂貨請求</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">已選擇的貨物</label>
                  {selectedItems.length === 0 ? (
                    <p className="text-gray-500 text-sm py-2">尚未選擇任何貨物</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {selectedItems.map(item => {
                        const inv = inventory.find(i => i.id === item.inventory_id)
                        return (
                          <div key={item.inventory_id} className="flex items-center gap-2">
                            <span className="flex-1">{inv?.name}</span>
                            <Input
                              type="number"
                              className="w-24"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(item.inventory_id, Number(e.target.value))}
                              min={1}
                            />
                            <span className="text-sm text-gray-500">{inv?.unit}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedItems(selectedItems.filter(i => i.inventory_id !== item.inventory_id))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">備註</label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="例如：急需，請盡快處理"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowNewRequestModal(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={selectedItems.length === 0}>
                    提交請求
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle>收貨確認</CardTitle>
              <CardDescription>確認實際收到的貨物數量</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>貨物</TableHead>
                    <TableHead>訂貨數量</TableHead>
                    <TableHead>實收數量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRequest.items?.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.inventory?.name}</TableCell>
                      <TableCell>{item.approved_quantity || item.requested_quantity} {item.inventory?.unit}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          value={receiptQuantities[item.inventory_id]}
                          onChange={(e) => setReceiptQuantities({ ...receiptQuantities, [item.inventory_id]: Number(e.target.value) })}
                          min={0}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                  取消
                </Button>
                <Button onClick={handleReceiptConfirm}>
                  <Check className="h-4 w-4 mr-1" />
                  確認收貨
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
