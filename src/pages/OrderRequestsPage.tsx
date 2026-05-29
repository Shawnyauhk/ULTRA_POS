import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, CheckCircle, AlertCircle, Loader2, Plus, Search, X, Pencil, Calendar, ChevronDown, ChevronRight, PackageCheck, FileCheck } from 'lucide-react';
import { useOrderRequests, useInventory } from '@/hooks/useSupabaseData';
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
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


function getRestaurantId(): string {
  const user = useAuthStore.getState().user;
  return user?.restaurant_id || FALLBACK_RESTAURANT_ID;
}

type ColumnType = 'request' | 'pending' | 'received' | 'completed';

export function OrderRequestsPage() {
  const { can } = usePermission();
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
  const [completedExpanded, setCompletedExpanded] = useState(false);

  // 簽收 Modal state
  const [showSignModal, setShowSignModal] = useState(false);
  const [signingOrder, setSigningOrder] = useState<OrderRequest | null>(null);
  const [actualQuantity, setActualQuantity] = useState(0);

  // Filter inventory for modal
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, selectedCategory]);

  // 決定每個訂單屬於哪一區
  const getOrderColumn = (order: OrderRequest): ColumnType => {
    const status = order.status;
    if (status === 'pending' || status === 'approved') return 'request';
    if (status === 'ordered' || status === 'partial') return 'pending';
    if (status === 'received') {
      const items = order.items || [];
      // 已簽收（received_quantity 不為 null）→ 已完成區
      if (items.length > 0 && items[0].received_quantity != null) {
        return 'completed';
      }
      // 未簽收 → 已送到欄
      return 'received';
    }
    if (status === 'rejected') return 'completed';
    return 'request';
  };

  // Check if request is overdue (>3 days in request column)
  const isOverdue = (createdAt: string, status: OrderRequestStatus): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
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

  const getStatusLabel = (status: OrderRequestStatus): string => {
    const labels: Record<OrderRequestStatus, string> = {
      pending: '待審批',
      approved: '已批准',
      rejected: '已拒絕',
      ordered: '已訂貨',
      partial: '部分到貨',
      received: '已送到'
    };
    return labels[status] || status;
  };

  // =========== 簽收功能 ===========
  const handleOpenSignModal = (order: OrderRequest) => {
    setSigningOrder(order);
    const items = order.items || [];
    const orderedQty = items.length > 0 ? items[0].requested_quantity : 0;
    setActualQuantity(orderedQty);
    setShowSignModal(true);
  };

  const handleSignConfirm = async () => {
    if (!signingOrder) return;
    const items = signingOrder.items || [];
    if (items.length === 0) return;

    setSaving(true);
    try {
      const item = items[0];
      const { error } = await supabase
        .from('order_request_items')
        .update({ received_quantity: actualQuantity })
        .eq('id', item.id);

      if (error) throw error;

      setShowSignModal(false);
      setSigningOrder(null);
      refetch();
    } catch (err) {
      console.error('簽收失敗:', err);
      alert('簽收失敗: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // =========== 訂貨請求操作（允許多選） ===========
  const handleToggleItem = (inv: Inventory) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.inventory.id === inv.id);
      if (exists) {
        return prev.filter(item => item.inventory.id !== inv.id);
      } else {
        return [...prev, { inventory: inv, quantity: 1 }];
      }
    });
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateQuantity = (index: number, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(index);
    } else {
      setSelectedItems(prev =>
        prev.map((item, i) => i === index ? { ...item, quantity: qty } : item)
      );
    }
  };

  const isItemSelected = (invId: string) => {
    return selectedItems.some(item => item.inventory.id === invId);
  };

  const handleSubmitRequest = async () => {
    if (selectedItems.length === 0) {
      alert('請先選擇至少一項貨物');
      return;
    }

    setSaving(true);
    try {
      let employeeId = user?.id;

      if (!employeeId || employeeId === 'demo-1') {
        const { data: employees, error: empError } = await supabase
          .from('employees')
          .select('id')
          .eq('restaurant_id', getRestaurantId())
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
              restaurant_id: getRestaurantId(),
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

      // 每項貨物各自建立獨立的訂貨請求
      let hasError = false;
      for (const sel of selectedItems) {
        const notes = sel.inventory.name;

        const { data: request, error: requestError } = await supabase
          .from('order_requests')
          .insert([{
            restaurant_id: getRestaurantId(),
            requested_by: employeeId,
            status: 'pending',
            notes
          }])
          .select()
          .single();

        if (requestError) {
          console.error('創建訂貨請求失敗:', requestError);
          hasError = true;
          continue;
        }

        const { error: itemError } = await supabase
          .from('order_request_items')
          .insert([{
            order_request_id: request.id,
            inventory_id: sel.inventory.id,
            requested_quantity: sel.quantity
          }]);

        if (itemError) {
          console.error('創建訂貨項目失敗:', itemError);
          hasError = true;
        }
      }

      if (hasError) {
        alert('部分貨物提交失敗，請查看控制台日誌');
      }

      // 發送 WhatsApp 通知給管理員（不阻塞主流程）
      const empName = user?.name || '系統用戶';
      fetch('/api/whatsapp/notify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: empName,
          restaurant_id: getRestaurantId(),
          items: selectedItems.map(s => ({
            name: s.inventory.name,
            quantity: s.quantity
          }))
        })
      }).catch(err => console.error('WhatsApp 通知失敗:', err));

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

  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    
    setSaving(true);
    try {
      const newNotes = requestNotes || editItems[0]?.inventory.name || '訂貨請求';
      const updates: Record<string, any> = { notes: newNotes, updated_at: new Date().toISOString() };
      if (editDate) updates.created_at = editDate;

      const { error: updateError } = await supabase
        .from('order_requests')
        .update(updates)
        .eq('id', editingRequest.id);

      if (updateError) throw updateError;

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

  const handleDeleteRequest = async () => {
    if (!editingRequest) return;
    setShowDeleteConfirm(false);
    setSaving(true);
    try {
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

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // =========== 渲染 Kanban 欄 ===========
  const renderColumn = (
    title: string,
    colType: ColumnType,
    icon: React.ReactNode,
    bgColor: string,
  ) => {
    const columnOrders = orderRequests.filter(o => getOrderColumn(o) === colType);
    // 只有 'request' 和 'pending' 的 drop 目標需要拖曳功能
    const isDraggableColumn = colType === 'request' || colType === 'pending' || colType === 'received';
    
    return (
      <div 
        className={`flex-1 flex flex-col min-h-[500px] rounded-xl p-4 transition-colors ${bgColor}`}
        onDragOver={isDraggableColumn ? handleDragOver : undefined}
        onDrop={isDraggableColumn ? (e) => {
          if (colType === 'request') handleDrop(e, 'pending');
          else if (colType === 'pending') handleDrop(e, 'ordered');
          else if (colType === 'received') handleDrop(e, 'received');
        } : undefined}
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
              const isReceivedColumn = colType === 'received';
              const qtyInfo = items.length > 0
                ? `×${items[0].requested_quantity} ${items[0].inventory?.unit || ''}`
                : '';
              return (
                <Card
                  key={order.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, order)}
                  className={`${isReceivedColumn ? '' : 'cursor-move'} hover:shadow-md transition-shadow ${isReceivedColumn ? '' : 'active:cursor-grabbing'} ${updating === order.id ? 'opacity-50' : ''} ${overdue ? 'border-red-500 border-2 bg-red-50' : ''}`}
                >
                  <CardContent className="p-3">
                    {/* 第一行：名稱 + 數量(放大) + 編輯 */}
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium text-sm leading-tight truncate flex-1 ${overdue ? 'text-red-600' : 'text-gray-800'}`}>
                        {order.notes || '無備註'}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {qtyInfo && (
                          <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{qtyInfo}</span>
                        )}
                        {can('order.approve') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 -mr-1"
                            onClick={() => handleEditRequest(order)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 第二行～N行：各狀態日期分行顯示（對齊） */}
                    <div className="flex items-start justify-between mt-1.5">
                      <div className="flex flex-col text-xs text-gray-400 min-w-0">
                        {/* 日期行統一縮排對齊 */}
                        <div className="flex items-center gap-1">
                          <span className="w-8 text-right shrink-0">申請</span>
                          <span>{formatDate(order.created_at)}</span>
                          <span className="text-gray-500 ml-2 text-xs">{order.employee?.name || '未知'}</span>
                        </div>
                        {order.ordered_at && (
                          <div className="flex items-center gap-1">
                            <span className="w-8 text-right shrink-0">訂貨</span>
                            <span>{formatDate(order.ordered_at)}</span>
                          </div>
                        )}
                        {order.received_at && (
                          <div className="flex items-center gap-1">
                            <span className="w-8 text-right shrink-0">送達</span>
                            <span>{formatDate(order.received_at)}</span>
                          </div>
                        )}
                      </div>
                      <Badge variant={overdue ? 'destructive' : 'outline'} className="text-[10px] h-4 px-1.5">
                        {getStatusLabel(order.status)}
                      </Badge>
                    </div>

                    {overdue && (
                      <p className="text-[10px] text-red-500 mt-1">已逾期 3 天以上</p>
                    )}

                    {/* 已送到欄：簽收按鈕 */}
                    {isReceivedColumn && (
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full mt-2 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleOpenSignModal(order)}
                      >
                        <PackageCheck className="h-3 w-3 mr-1" />
                        簽收
                      </Button>
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

  // =========== 已完成區（可折疊） ===========
  const completedOrders = orderRequests.filter(o => getOrderColumn(o) === 'completed');

  const renderCompletedSection = () => (
    <Card className="border-gray-300">
      <button
        onClick={() => setCompletedExpanded(!completedExpanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {completedExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <FileCheck className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-gray-800">已完成</span>
          <Badge variant="secondary">{completedOrders.length} 項</Badge>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform ${completedExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {completedExpanded && (
        <CardContent className="pt-0 pb-4">
          {completedOrders.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">暫無已完成項目</div>
          ) : (
            <div className="space-y-2">
              {completedOrders.map(order => {
                const items = order.items || [];
                const item = items[0];
                const orderedQty = item?.requested_quantity || 0;
                const receivedQty = item?.received_quantity;
                const unit = item?.inventory?.unit || '';
                const isMatch = receivedQty != null && receivedQty === orderedQty;
                const isRejected = order.status === 'rejected';

                return (
                  <div key={order.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1">
                        <p className="font-medium text-sm text-gray-800">{order.notes || '無備註'}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>{formatDate(order.created_at)}</span>
                          <span>{order.employee?.name || '未知'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {isRejected ? (
                        <Badge variant="destructive">已拒絕</Badge>
                      ) : (
                        <>
                          <span className="text-gray-500">訂: {orderedQty}{unit}</span>
                          {receivedQty != null && (
                            <>
                              <span className="text-gray-500">收: {receivedQty}{unit}</span>
                              {isMatch ? (
                                <Badge variant="success" className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> 一致
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" /> 不符（差{Math.abs(orderedQty - receivedQty)}{unit}）
                                </Badge>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">訂貨管理</h1>
          <p className="text-muted-foreground">拖曳卡片以更改訂貨請求狀態</p>
        </div>
        {can('order.create') && (
          <Button onClick={() => setShowRequestModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            訂貨請求
          </Button>
        )}
      </div>

      {/* Kanban 三欄 */}
      <div className="flex gap-6 overflow-x-auto pb-4">
        {renderColumn('員工請求 (Request)', 'request', <AlertCircle className="w-5 h-5 text-red-500"/>, 'bg-red-50')}
        {renderColumn('待處理 (Pending)', 'pending', <Clock className="w-5 h-5 text-yellow-500"/>, 'bg-yellow-50')}
        {renderColumn('已送到 (Received)', 'received', <PackageCheck className="w-5 h-5 text-green-500"/>, 'bg-green-50')}
      </div>

      {/* 已完成區（可折疊） */}
      {renderCompletedSection()}

      {/* ========== Modal：訂貨請求 ========== */}
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
              {/* 已選擇的貨物（多選） */}
              {selectedItems.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <h4 className="font-medium mb-2">已選擇的貨物（{selectedItems.length} 項）</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedItems.map((item, index) => (
                      <div key={item.inventory.id} className="flex items-center justify-between bg-white rounded p-3">
                        <div className="flex-1 min-w-0 mr-2">
                          <span className="font-medium text-sm truncate block">{item.inventory.name}</span>
                          <span className="text-gray-500 text-xs">({item.inventory.category})</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                          >-</Button>
                          <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                          >+</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="flex-1 overflow-y-auto">
                {inventoryLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">沒有找到符合條件的貨物</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredInventory.map((inv) => {
                      const selected = isItemSelected(inv.id);
                      return (
                        <div
                          key={inv.id}
                          className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            selected
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'hover:border-primary'
                          }`}
                          onClick={() => handleToggleItem(inv)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-sm truncate flex-1">{inv.name}</div>
                            {selected && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center ml-1 shrink-0">
                                <CheckCircle className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{inv.category}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            單位: {inv.unit}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

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

      {/* ========== Modal：編輯訂貨請求 ========== */}
      {showEditModal && editingRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>編輯訂貨請求</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="text-sm font-medium">備註 / 標題</label>
                <Input
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="輸入備註..."
                  className="mt-1"
                />
              </div>

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

      {/* ========== Modal：簽收 ========== */}
      {showSignModal && signingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-green-600" />
                簽收貨物
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const items = signingOrder.items || [];
                const item = items[0];
                const orderedQty = item?.requested_quantity || 0;
                const invName = item?.inventory?.name || '未知';
                const unit = item?.inventory?.unit || '件';
                const isMatch = actualQuantity === orderedQty;

                return (
                  <>
                    {/* 貨物資訊 */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">貨物名稱</span>
                        <span className="font-medium">{invName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">訂貨備註</span>
                        <span className="font-medium">{signingOrder.notes || '無'}</span>
                      </div>
                    </div>

                    {/* 數量比對 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-3">
                        <span className="text-sm font-medium text-blue-800">已訂數量</span>
                        <span className="text-lg font-bold text-blue-800">{orderedQty} {unit}</span>
                      </div>

                      <div>
                        <label className="text-sm font-medium block mb-1">
                          實際收到數量
                        </label>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActualQuantity(Math.max(0, actualQuantity - 1))}
                          >-</Button>
                          <Input
                            type="number"
                            value={actualQuantity}
                            onChange={(e) => setActualQuantity(Math.max(0, Number(e.target.value)))}
                            className="text-center text-lg font-bold"
                            min="0"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActualQuantity(actualQuantity + 1)}
                          >+</Button>
                        </div>
                      </div>

                      {/* 比對結果 */}
                      <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${
                        isMatch ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {isMatch ? (
                          <>
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">✅ 數量一致，沒有問題</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-5 w-5" />
                            <span className="font-medium">
                              ⚠️ 數量不符（訂 {orderedQty}，實收 {actualQuantity}，差 {Math.abs(orderedQty - actualQuantity)}{unit}）
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowSignModal(false);
                          setSigningOrder(null);
                        }}
                        disabled={saving}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={handleSignConfirm}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={saving}
                      >
                        {saving ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />處理中...</>
                        ) : (
                          <><PackageCheck className="w-4 h-4 mr-2" />確認簽收</>
                        )}
                      </Button>
                    </div>
                  </>
                );
              })()}
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
