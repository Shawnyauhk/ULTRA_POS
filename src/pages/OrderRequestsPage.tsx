import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, CheckCircle, AlertCircle, Loader2, Plus, Search, X, Pencil, Calendar } from 'lucide-react';
import { useOrderRequests, useInventory } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { OrderRequest, OrderRequestStatus, Inventory } from '@/types';

// Warehouse categories
const warehouseCategories = [
  '全部',
  '糖水配料',
  '茶用品',
  '碗/杯/袋/用具',
  '煎餅配料',
  '雜物',
  '雞蛋仔/格餅配料',
];

const DEMO_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

export function OrderRequestsPage() {
  const { orderRequests, loading, refetch, updateOrderRequestStatus } = useOrderRequests();
  const { inventory, loading: inventoryLoading } = useInventory();
  const { user } = useAuthStore();
  const [draggedOrder, setDraggedOrder] = useState<OrderRequest | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<OrderRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<{ inventory: Inventory; quantity: number }[]>([]);
  const [requestNotes, setRequestNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editItems, setEditItems] = useState<{ id?: string; inventory: Inventory; quantity: number }[]>([]);
  const [editDate, setEditDate] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Filter inventory for modal
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, selectedCategory]);

  // Check if request is overdue (>3 days in request column)
  const isOverdue = (createdAt: string, status: OrderRequestStatus): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    
    // Overdue if in 'request' column and more than 3 days
    const inRequestColumn = status === 'pending' || status === 'approved';
    return inRequestColumn && diffDays >= 3;
  };

  const handleDragStart = (e: React.DragEvent, order: OrderRequest) => {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: OrderRequestStatus) => {
    e.preventDefault();
    if (draggedOrder && draggedOrder.status !== newStatus) {
      setUpdating(draggedOrder.id);
      await updateOrderRequestStatus(draggedOrder.id, newStatus);
      setUpdating(null);
    }
    setDraggedOrder(null);
  };

  const getStatusForColumn = (status: OrderRequestStatus): 'request' | 'pending' | 'completed' => {
    if (status === 'pending' || status === 'approved') return 'request';
    if (status === 'ordered' || status === 'partial') return 'pending';
    if (status === 'received' || status === 'rejected') return 'completed';
    return 'request';
  };

  const getStatusLabel = (status: OrderRequestStatus): string => {
    const labels: Record<OrderRequestStatus, string> = {
      pending: '待審批',
      approved: '已批准',
      rejected: '已拒絕',
      ordered: '已訂貨',
      partial: '部分到貨',
      received: '已完成'
    };
    return labels[status] || status;
  };

  // Add/replace item (only one item per request)
  const handleAddItem = (inv: Inventory) => {
    setSelectedItems([{ inventory: inv, quantity: 1 }]);
  };

  // Remove item
  const handleRemoveItem = () => {
    setSelectedItems([]);
  };

  // Update quantity for the single item
  const handleUpdateQuantity = (qty: number) => {
    if (qty <= 0 || !selectedItems[0]) {
      handleRemoveItem();
    } else {
      setSelectedItems([{ ...selectedItems[0], quantity: qty }]);
    }
  };

  // Submit order request
  const handleSubmitRequest = async () => {
    if (selectedItems.length === 0) {
      alert('請先選擇至少一項貨物');
      return;
    }

    setSaving(true);
    try {
      // Get a valid employee ID from the database
      let employeeId = user?.id;

      if (!employeeId || employeeId === 'demo-1') {
        const { data: employees, error: empError } = await supabase
          .from('employees')
          .select('id')
          .eq('restaurant_id', DEMO_RESTAURANT_ID)
          .limit(1);

        if (empError) {
          alert('查詢員工資料失敗: ' + empError.message);
          setSaving(false);
          return;
        }

        if (employees && employees.length > 0) {
          employeeId = employees[0].id;
        } else {
          const { data: newEmp, error: createEmpError } = await supabase
            .from('employees')
            .insert([{
              restaurant_id: DEMO_RESTAURANT_ID,
              name: '系統用戶',
              role: 'staff',
              hire_date: new Date().toISOString(),
              is_active: true,
            }])
            .select()
            .single();

          if (createEmpError || !newEmp) {
            alert('找不到有效的員工記錄，且無法自動創建。\n錯誤: ' + (createEmpError?.message || '未知錯誤'));
            setSaving(false);
            return;
          }
          employeeId = newEmp.id;
        }
      }

      // Title = item name (直接貨物名)
      const notes = selectedItems[0]?.inventory.name || '訂貨請求';

      // Create order request
      const { data: request, error: requestError } = await supabase
        .from('order_requests')
        .insert([{
          restaurant_id: DEMO_RESTAURANT_ID,
          requested_by: employeeId,
          status: 'pending',
          notes
        }])
        .select()
        .single();

      if (requestError) {
        let msg = '創建訂貨請求失敗: ' + requestError.message;
        if (requestError.code === '42501') {
          msg += '\n\n需要新增 RLS 權限策略。請執行 SQL:\n' +
            '前往 Supabase → SQL Editor → 執行 SQL 遷移腳本';
        } else if (requestError.code === '23503') {
          msg += '\n\n員工 ID 無效 (外鍵約束錯誤)';
        }
        alert(msg);
        setSaving(false);
        return;
      }

      // Create order request items
      const itemsToInsert = selectedItems.map(item => ({
        order_request_id: request.id,
        inventory_id: item.inventory.id,
        requested_quantity: item.quantity
      }));

      const { error: itemsError } = await supabase
        .from('order_request_items')
        .insert(itemsToInsert);

      if (itemsError) {
        alert('創建訂貨項目失敗: ' + itemsError.message);
        setSaving(false);
        return;
      }

      // Reset and close
      setSelectedItems([]);
      setRequestNotes('');
      setShowRequestModal(false);
      refetch();
    } catch (err) {
      console.error('Error creating order request:', err);
      alert('發生錯誤，請查看控制台日誌');
    } finally {
      setSaving(false);
    }
  };

  // Edit order request
  const handleEditRequest = (order: OrderRequest) => {
    setEditingRequest(order);
    setRequestNotes(order.notes || '');
    setEditDate(order.created_at ? new Date(order.created_at).toISOString().slice(0, 16) : '');
    setEditItems((order.items || []).map(item => ({
      id: item.id,
      inventory: item.inventory || { id: item.inventory_id, name: '未知貨物', category: '', unit: '', current_stock: 0, min_stock_level: 0, restaurant_id: '', last_updated: '', created_at: '' },
      quantity: item.requested_quantity
    })));
    setShowEditModal(true);
  };

  // Save edit (notes + items + date)
  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    
    setSaving(true);
    try {
      // Update order notes + date
      const newNotes = requestNotes || editItems[0]?.inventory.name || '訂貨請求';
      const updates: Record<string, any> = { notes: newNotes, updated_at: new Date().toISOString() };
      if (editDate) updates.created_at = editDate;

      const { error: updateError } = await supabase
        .from('order_requests')
        .update(updates)
        .eq('id', editingRequest.id);

      if (updateError) throw updateError;

      // Update existing items (quantities)
      for (const item of editItems) {
        if (item.id) {
          const { error: itemError } = await supabase
            .from('order_request_items')
            .update({ requested_quantity: item.quantity })
            .eq('id', item.id);
          if (itemError) throw itemError;
        }
      }

      setShowEditModal(false);
      setEditingRequest(null);
      setRequestNotes('');
      setEditItems([]);
      setEditDate('');
      refetch();
    } catch (err) {
      console.error('Error updating order request:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete order request
  const handleDeleteRequest = async () => {
    if (!editingRequest) return;
    setShowDeleteConfirm(false);
    setSaving(true);
    try {
      // Delete items first, then the request
      await supabase.from('order_request_items').delete().eq('order_request_id', editingRequest.id);
      const { error } = await supabase.from('order_requests').delete().eq('id', editingRequest.id);
      if (error) { alert('刪除失敗: ' + error.message); setSaving(false); return; }

      setShowEditModal(false);
      setEditingRequest(null);
      setRequestNotes('');
      setEditItems([]);
      setEditDate('');
      refetch();
    } catch (err) {
      console.error('Delete error:', err);
      alert('刪除時發生錯誤');
    } finally {
      setSaving(false);
    }
  };

  // Edit item helper (single item per request)
  const handleEditItemQty = (qty: number) => {
    if (qty <= 0 || editItems.length === 0) return;
    setEditItems(prev => [{ ...prev[0], quantity: qty }]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderColumn = (title: string, status: 'request' | 'pending' | 'completed', icon: React.ReactNode, bgColor: string) => {
    const columnOrders = orderRequests.filter(o => getStatusForColumn(o.status) === status);
    
    return (
      <div 
        className={`flex-1 flex flex-col min-h-[500px] rounded-xl p-4 transition-colors ${bgColor}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status === 'request' ? 'pending' : status === 'pending' ? 'ordered' : 'received')}
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="font-bold text-lg flex items-center gap-2">{icon} {title}</h2>
          <Badge variant="secondary">{columnOrders.length}</Badge>
        </div>
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : columnOrders.length > 0 ? (
              columnOrders.map(order => {
              const overdue = isOverdue(order.created_at, order.status);
              const items = order.items || [];
              return (
                <Card 
                  key={order.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, order)}
                  className={`cursor-move hover:shadow-md transition-shadow active:cursor-grabbing ${updating === order.id ? 'opacity-50' : ''} ${overdue ? 'border-red-500 border-2 bg-red-50' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <p className={`font-bold text-sm ${overdue ? 'text-red-600' : 'text-gray-800'}`}>
                        {order.notes || '無備註'}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => handleEditRequest(order)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Quantity display only */}
                    <div className="mb-2">
                      {items.length > 0 ? (
                        <span className="text-sm text-gray-600">
                          ×{items[0].requested_quantity} {items[0].inventory?.unit || ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">無數量資訊</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(order.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">申請人: {order.employee?.name || '未知'}</p>
                      <p className="text-xs text-gray-400">{getStatusLabel(order.status)}</p>
                    </div>
                    {overdue && (
                      <Badge variant="destructive" className="mt-2 text-xs">已逾期 3 天以上</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              拖曳至此處
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">訂貨管理</h1>
          <p className="text-muted-foreground">拖曳卡片以更改訂貨請求狀態</p>
        </div>
        <Button onClick={() => setShowRequestModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          訂貨請求
        </Button>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4">
        {renderColumn('員工請求 (Request)', 'request', <AlertCircle className="w-5 h-5 text-red-500"/>, 'bg-red-50')}
        {renderColumn('待處理 (Pending)', 'pending', <Clock className="w-5 h-5 text-yellow-500"/>, 'bg-yellow-50')}
        {renderColumn('已完成 (Completed)', 'completed', <CheckCircle className="w-5 h-5 text-green-500"/>, 'bg-green-50')}
      </div>

      {/* Order Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>訂貨請求 - 選擇貨物</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => {
                setShowRequestModal(false);
                setSelectedItems([]);
                setRequestNotes('');
              }}>
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Selected Item (single item per request) */}
              {selectedItems.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <h4 className="font-medium mb-2">已選擇的貨物</h4>
                  <div className="flex items-center justify-between bg-white rounded p-3">
                    <div>
                      <span className="font-medium">{selectedItems[0].inventory.name}</span>
                      <span className="text-gray-500 text-sm ml-2">({selectedItems[0].inventory.category})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleUpdateQuantity(selectedItems[0].quantity - 1)}
                      >-</Button>
                      <span className="w-10 text-center font-medium">{selectedItems[0].quantity}</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleUpdateQuantity(selectedItems[0].quantity + 1)}
                      >+</Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleRemoveItem}
                      >
                        移除
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Search and Category Filter */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="搜尋貨物名稱..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {warehouseCategories.map((cat) => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Inventory Grid */}
              <div className="flex-1 overflow-y-auto">
                {inventoryLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">沒有找到符合條件的貨物</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredInventory.map((inv) => (
                      <div 
                        key={inv.id} 
                        className="border rounded-lg p-3 hover:border-primary cursor-pointer transition-colors"
                        onClick={() => handleAddItem(inv)}
                      >
                        <div className="font-medium text-sm">{inv.name}</div>
                        <div className="text-xs text-gray-500">{inv.category}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          庫存: {inv.current_stock} {inv.unit}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes and Submit */}
              <div className="border-t pt-4">
                <div className="mb-4">
                  <label className="text-sm font-medium">備註</label>
                  <Input
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    placeholder="輸入訂貨備註..."
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowRequestModal(false);
                      setSelectedItems([]);
                      setRequestNotes('');
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitRequest}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={selectedItems.length === 0 || saving}
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />提交中...</>
                    ) : (
                      <>提交訂貨請求</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Request Modal */}
      {showEditModal && editingRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>編輯訂貨請求</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-4">
              {/* Notes */}
              <div>
                <label className="text-sm font-medium">備註 / 標題</label>
                <Input
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="輸入備註..."
                  className="mt-1"
                />
              </div>

              {/* Single item with editable quantity */}
              {editItems.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">訂貨項目</label>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{editItems[0].inventory.name}</p>
                      <p className="text-xs text-gray-500">{editItems[0].inventory.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => handleEditItemQty(editItems[0].quantity - 1)}
                      >-</Button>
                      <input
                        type="number"
                        value={editItems[0].quantity}
                        onChange={(e) => handleEditItemQty(Math.max(1, Number(e.target.value)))}
                        className="w-16 text-center border rounded h-8 text-sm"
                        min="1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8"
                        onClick={() => handleEditItemQty(editItems[0].quantity + 1)}
                      >+</Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-sm space-y-2">
                <div>
                  <label className="font-medium text-gray-500">日期時間</label>
                  <input
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="ml-2 border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <span className="text-gray-500">狀態: </span>
                  <span className="font-medium">{getStatusLabel(editingRequest.status)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  刪除
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingRequest(null);
                      setRequestNotes('');
                      setEditItems([]);
                      setEditDate('');
                    }}
                  >
                    取消
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    儲存
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle>確認刪除</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">確定要刪除此訂貨請求？此操作無法復原。</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
                <Button variant="destructive" onClick={handleDeleteRequest} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  確認刪除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
