import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, CheckCircle, AlertCircle, Loader2, Plus, Search, X, Pencil, Calendar, ChevronDown, ChevronRight, PackageCheck, FileCheck, Package, Trash2 } from 'lucide-react';
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
  const navigate = useNavigate();
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
  const [selectMode, setSelectMode] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragState, setDragState] = useState<{
    order: OrderRequest;
    overCol: ColumnType | null;
    originCol: ColumnType;
  } | null>(null);
  // 实时位置走 ref，直写 DOM，零延迟
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const floatCloneRef = useRef<HTMLDivElement>(null); // 浮起卡片 DOM ref
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // =========== 桌面同欄拖曳排序 ===========
  const [columnOrder, setColumnOrder] = useState<Record<ColumnType, string[]>>({ request: [], pending: [], received: [], completed: [] });
  const desktopDragRef = useRef<{ orderId: string; colType: ColumnType } | null>(null);
  const [desktopDraggingId, setDesktopDraggingId] = useState<string | null>(null);

  // 當訂單載入時初始化排序
  useEffect(() => {
    if (orderRequests.length > 0) {
      setColumnOrder(prev => {
        const next = { ...prev };
        for (const col of ['request', 'pending', 'received'] as ColumnType[]) {
          if (next[col].length === 0) {
            next[col] = orderRequests.filter(o => getOrderColumn(o) === col).map(o => o.id);
          }
        }
        return next;
      });
    }
  }, [orderRequests]);

  const reorderColumn = (colType: ColumnType, fromIndex: number, toIndex: number) => {
    setColumnOrder(prev => {
      const ids = [...(prev[colType] || [])];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      return { ...prev, [colType]: ids };
    });
  };

  const getSortedOrders = (colType: ColumnType) => {
    const orders = orderRequests.filter(o => getOrderColumn(o) === colType);
    const sortIds = columnOrder[colType];
    if (!sortIds || sortIds.length === 0) return orders;
    return [...orders].sort((a, b) => {
      const ai = sortIds.indexOf(a.id);
      const bi = sortIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  };

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

  // =========== 手機觸控拖拽 ===========
  const LONG_PRESS_MS = 300;
  const handleTouchStart = (order: OrderRequest, e: React.TouchEvent) => {
    e.preventDefault(); // 阻止文字選擇
    const touch = e.touches[0];
    // 先記錄初始位置（即使未觸發浮起也存，供浮起時立即使用）
    dragPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      const originCol = getOrderColumn(order);
      setDragState({ order, overCol: originCol, originCol });
      setIsDragging(true);
      setExpandedOrder(null);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    // 滑動時清除長按計時器（區分「滑動」與「長按後拖曳」）
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
      return;
    }

    if (!dragState) return;

    e.preventDefault(); // 阻止滾動

    // ★ 直接操作 DOM 更新位置，繞過 React 渲染，完全消除延遲
    dragPosRef.current = { x: touch.clientX, y: touch.clientY };
    if (floatCloneRef.current) {
      floatCloneRef.current.style.left = `${touch.clientX - 100}px`;
      floatCloneRef.current.style.top = `${touch.clientY - 30}px`;
    }

    // 偵測當前在哪一欄（setState 更新高亮）
    if (containerRef.current) {
      const colEls = containerRef.current.children;
      let found: ColumnType | null = null;
      for (let i = 0; i < colEls.length; i++) {
        const rect = colEls[i].getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right) {
          const colMap: ColumnType[] = ['request', 'pending', 'received'];
          found = colMap[i] || null;
          break;
        }
      }
      setDragState(prev => prev ? { ...prev, overCol: found } : null);
    }
  };

  const handleTouchEnd = async () => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;

    if (dragState?.overCol && dragState.overCol !== dragState.originCol) {
      setUpdating(dragState.order.id);
      await updateOrderRequestStatus(dragState.order.id, dropStatusMap[dragState.overCol]);
      setUpdating(null);
    }
    setDragState(null);
    setIsDragging(false);
  };

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.style.userSelect = '';
    };
  }, []);

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

  const handleBatchDelete = async () => {
    if (batchSelectedIds.size === 0) return;
    if (!confirm(`確定刪除已選的 ${batchSelectedIds.size} 項訂貨請求？此操作無法復原。`)) return;
    let hasError = false;
    for (const id of batchSelectedIds) {
      try {
        await supabase.from('order_request_items').delete().eq('order_request_id', id);
        await supabase.from('order_requests').delete().eq('id', id);
      } catch (err) {
        console.error('批量刪除失敗 id:', id, err);
        hasError = true;
      }
    }
    if (hasError) alert('部分項目刪除失敗，請查看控制台');
    setBatchSelectedIds(new Set());
    setSelectMode(false);
    refetch();
  };

  const handleDeleteSingleCard = async (order: OrderRequest) => {
    if (!confirm('確定刪除此訂貨請求？此操作無法復原。')) return;
    try {
      await supabase.from('order_request_items').delete().eq('order_request_id', order.id);
      await supabase.from('order_requests').delete().eq('id', order.id);
      refetch();
    } catch (err) {
      console.error('Delete error:', err);
      alert('刪除失敗');
    }
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

  const formatShortDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${m}/${d} ${h}:${min}`;
  };

  // =========== 展開的訂單詳情 ===========
  const DetailContent = ({ order }: { order: OrderRequest }) => {
    const items = order.items || [];
    return (
      <CardContent className="p-3 pt-2 border-t bg-gray-50 space-y-2">
        {items.length > 0 && (
          <div className="space-y-1 text-sm">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-gray-700">{item.inventory?.name || '未知貨物'}</span>
                <span className="font-medium">×{item.requested_quantity}{item.inventory?.unit || ''}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col text-xs text-gray-400 space-y-0.5 pt-1">
          <div className="flex items-center gap-1">
            <span className="w-8 text-right shrink-0">申請</span>
            <span>{formatDate(order.created_at)}</span>
            <span className="text-gray-500 ml-1">{order.employee?.name || '未知'}</span>
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
        {isOverdue(order.created_at, order.status) && (
          <p className="text-[10px] text-red-500 pt-1">已逾期 3 天以上</p>
        )}
      </CardContent>
    );
  };

  // 拖放目標→狀態映射
  const dropStatusMap: Record<ColumnType, OrderRequestStatus> = {
    request: 'pending',
    pending: 'ordered',
    received: 'received',
    completed: 'received',
  };

  // =========== 渲染三欄（可拖放） ===========
  const renderColumn = (
    title: string,
    colType: ColumnType,
    icon: React.ReactNode,
    bgColor: string,
  ) => {
    const columnOrders = getSortedOrders(colType);
    const borderColor = colType === 'request' ? 'border-red-200' : colType === 'pending' ? 'border-yellow-200' : 'border-green-200';
    return (
      <div
        className={`rounded-xl p-2 md:p-3 transition-all duration-200 min-w-[155px] flex-shrink-0 md:min-w-0 ${bgColor} ${dragState?.overCol === colType ? 'ring-2 ring-indigo-400 bg-indigo-50/50 scale-[1.02]' : ''}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, dropStatusMap[colType])}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="font-semibold text-sm md:text-base flex items-center gap-2">{icon} {title}</h2>
          <Badge variant="secondary" className="text-xs">{columnOrders.length}</Badge>
        </div>
        <div className="space-y-1.5 md:space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : columnOrders.length > 0 ? (
            columnOrders.map((order, cardIdx) => {
              const items = order.items || [];
              const firstItem = items[0];
              const isExpanded = expandedOrder === order.id;
              const statusLabel = getStatusLabel(order.status);
              return (
                <Card
                  key={order.id}
                  draggable="true"
                  ref={el => { if (el) cardRefs.current.set(order.id, el); }}
                  className={`overflow-hidden select-none transition-all duration-200 ${borderColor} ${isExpanded ? 'border-primary/50 ring-1 ring-primary/20' : ''} ${dragState?.order.id === order.id || desktopDraggingId === order.id ? 'opacity-70 scale-[0.98]' : ''} ${isDragging && dragState?.order.id === order.id ? 'shadow-2xl scale-[1.03] ring-2 ring-indigo-400 z-50 relative' : 'hover:shadow-md active:scale-[1.01]'}`}
                  onTouchStart={(e) => handleTouchStart(order, e)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', order.id);
                    desktopDragRef.current = { orderId: order.id, colType };
                    setDraggedOrder(order);
                    setDesktopDraggingId(order.id);
                  }}
                  onDragOver={(e) => {
                    if (!desktopDragRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    // 同欄排序（不同欄由 Column 的 handleDrop 處理）
                    if (desktopDragRef.current.colType !== colType) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const threshold = rect.height / 2;
                    const isAfter = y > threshold;
                    const targetIdx = cardIdx + (isAfter ? 1 : 0);
                    const fromIdx = columnOrders.findIndex(o => o.id === desktopDragRef.current!.orderId);
                    if (fromIdx !== -1 && targetIdx !== fromIdx && targetIdx !== fromIdx + 1) {
                      reorderColumn(colType, fromIdx, targetIdx > fromIdx ? targetIdx - 1 : targetIdx);
                      desktopDragRef.current = { orderId: order.id, colType };
                    }
                  }}
                  onDragEnd={() => {
                    desktopDragRef.current = null;
                    setDraggedOrder(null);
                    setDesktopDraggingId(null);
                  }}
                >
                  <div
                    className="p-2.5 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => {
                      if (selectMode) {
                        setBatchSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                          return next;
                        });
                      } else {
                        setExpandedOrder(isExpanded ? null : order.id);
                      }
                    }}
                  >
                    {/* 選擇模式勾選框 */}
                    {selectMode && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <input type="checkbox" checked={batchSelectedIds.has(order.id)}
                          onChange={() => {
                            setBatchSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" />
                        <span className="text-xs text-gray-400 font-normal">選擇</span>
                      </div>
                    )}
                    {/* 預設只顯示貨物名 + 數量（緊密排列） */}
                    <div className="text-sm font-medium text-gray-800 leading-snug flex items-baseline gap-1">
                      <span className="truncate">{firstItem?.inventory?.name || order.notes || '未知貨物'}</span>
                      {firstItem && (
                        <span className="text-[11px] text-gray-500 font-normal shrink-0">
                          x{firstItem.requested_quantity}{firstItem.inventory?.unit || ''}
                        </span>
                      )}
                    </div>

                    {/* 展開後的詳情（優化排版） */}
                    {isExpanded && (
                      <div className="mt-2 pt-2.5 border-t border-dashed border-gray-200 space-y-1.5">
                        {/* 編輯按鈕 + 數量 */}
                        <div className="flex items-center justify-between">
                          {firstItem && (
                            <span className="text-xs text-gray-900 font-medium">
                              {firstItem.requested_quantity}{firstItem.inventory?.unit || '件'}
                            </span>
                          )}
                          {can('order.approve') && (
                            <div className="flex items-center gap-1">
                              <button
                                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); handleEditRequest(order); }}
                              >
                                <Pencil className="h-3 w-3" />
                                編輯
                              </button>
                              <button
                                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSingleCard(order);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                                刪除
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 時間 / 員工 以 grid 對齊 */}
                        <div className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-[11px] text-gray-400">
                          <span className="text-gray-500">申請</span>
                          <span>{formatShortDateTime(order.created_at)}</span>
                          <span className="text-gray-500">員工</span>
                          <span>{order.employee?.name || '未知'}</span>
                          {colType === 'pending' && order.ordered_at && (
                            <><span className="text-gray-500">訂貨</span><span>{formatShortDateTime(order.ordered_at)}</span></>
                          )}
                          {colType === 'received' && order.received_at && (
                            <><span className="text-gray-500">送達</span><span>{formatShortDateTime(order.received_at)}</span></>
                          )}
                        </div>

                        {/* 貨物清單 */}
                        {items.length > 0 && (
                          <div className="pt-1">
                            <div className="text-[10px] text-gray-400 mb-1 font-medium">貨物清單</div>
                            {items.map((item: any, idx: number) => (
                              <div key={item.id} className="flex items-center gap-1.5 text-[11px] py-0.5">
                                <span className="text-gray-700 truncate">{item.inventory?.name || '未知貨物'}</span>
                                <span className="text-gray-500 shrink-0">
                                  x{item.requested_quantity}{item.inventory?.unit || ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 狀態標籤 + 逾期 */}
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            order.status === 'pending' ? 'bg-red-100 text-red-700' :
                            order.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'ordered' ? 'bg-yellow-100 text-yellow-700' :
                            order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                            order.status === 'received' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {statusLabel}
                          </span>
                          {isOverdue(order.created_at, order.status) && (
                            <span className="text-[10px] text-red-500">已逾期3天以上</span>
                          )}
                        </div>

                        {/* 簽收按鈕 */}
                        {colType === 'received' && (
                          <button
                            className="w-full py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium"
                            onClick={(e) => { e.stopPropagation(); handleOpenSignModal(order); }}
                          >
                            簽收
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-6 text-sm text-gray-400">
              暫無訂單
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
    <div className="p-3 md:p-4 space-y-2 md:space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">訂貨管理</h1>
          <p className="text-sm text-muted-foreground">點擊卡片檢視詳細內容</p>
        </div>
        <div className="flex items-center gap-2">
          {can('order.approve') && (
            <Button variant={selectMode ? 'default' : 'outline'} size="sm"
              onClick={() => { setSelectMode(!selectMode); setBatchSelectedIds(new Set()); }}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              {selectMode ? '取消選擇' : '批量刪除'}
            </Button>
          )}
          {selectMode && batchSelectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
              刪除 {batchSelectedIds.size} 項
            </Button>
          )}
          {can('order.create') && (
            <Button onClick={() => setShowRequestModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              訂貨請求
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/inventory")}>
            <Package className="h-4 w-4 mr-1.5" />
            貨物表
          </Button>
        </div>
      </div>

      {/* 三欄：手機橫向滾動，桌面並排 */}
      <div
        ref={containerRef}
        className={`flex gap-2 pb-3 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible ${isDragging ? 'overflow-x-hidden touch-none' : 'overflow-x-auto'}`}
      >
        {renderColumn('員工請求', 'request', <AlertCircle className="w-5 h-5 text-red-500"/>, 'bg-red-50')}
        {renderColumn('待處理', 'pending', <Clock className="w-5 h-5 text-yellow-500"/>, 'bg-yellow-50')}
        {renderColumn('已送到', 'received', <PackageCheck className="w-5 h-5 text-green-500"/>, 'bg-green-50')}
      </div>

      {/* 浮起的拖拽卡片克隆 — 位置由 ref 直寫 DOM，無過渡延遲 */}
      {dragState && (
        <div
          ref={floatCloneRef}
          className="fixed pointer-events-none z-50"
          style={{
            left: dragPosRef.current.x - 100,
            top: dragPosRef.current.y - 30,
            width: 200,
          }}
        >
          <Card className="shadow-2xl scale-[1.03] ring-2 ring-indigo-400 rotate-1 opacity-95 bg-white">
            <div className="p-2.5 text-sm font-medium text-gray-800 truncate">
              {dragState.order.items?.[0]?.inventory?.name || dragState.order.notes || '未知貨物'}
            </div>
          </Card>
        </div>
      )}

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
