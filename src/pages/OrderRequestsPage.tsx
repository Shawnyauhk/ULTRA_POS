import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, CheckCircle, AlertCircle, Loader2, Plus, Search, X, Pencil, ChevronDown, ChevronRight, PackageCheck, FileCheck, ClipboardList, Box, Tags, Trash2 } from 'lucide-react';
import { useOrderRequests, useInventory } from '@/hooks/useSupabaseData';
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import { usePermission } from '@/hooks/usePermission';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { OrderRequest, OrderRequestStatus, Inventory, PermissionKey } from '@/types';

type OrderTab = 'orders' | 'inventory'

const DEFAULT_CATEGORIES = ['糖水配料', '茶用品', '碗/杯/袋/用具', '煎餅配料', '雜物', '雞蛋仔/格餅配料'];


function getRestaurantId(): string {
  const user = useAuthStore.getState().user;
  return user?.restaurant_id || FALLBACK_RESTAURANT_ID;
}

type ColumnType = 'request' | 'pending' | 'received' | 'completed';

export function OrderRequestsPage() {
  const { can } = usePermission();
  const { orderRequests, loading, refetch, updateOrderRequestStatus } = useOrderRequests();
  const { inventory, loading: inventoryLoading, refetch: refetchInv, updateInventory, addInventory } = useInventory();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<OrderTab>('orders');
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
  const [completedDetailOrder, setCompletedDetailOrder] = useState<string | null>(null);
  const [historyModalOrder, setHistoryModalOrder] = useState<OrderRequest | null>(null);
const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
const [optimisticCols, setOptimisticCols] = useState<Record<string, ColumnType>>({});
const [isDragging, setIsDragging] = useState(false);
const [pressedCard, setPressedCard] = useState<string | null>(null);
const [dragState, setDragState] = useState<{
    order: OrderRequest;
    overCol: ColumnType | null;
    originCol: ColumnType;
  } | null>(null);
  // 实时位置走 ref，直写 DOM，零延迟
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const floatCloneRef = useRef<HTMLDivElement>(null); // 浮起卡片 DOM ref
  const pageContainerRef = useRef<HTMLDivElement>(null); // 頁面容器 ref（用來計算絕對定位偏移）
const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
const pressTimer = useRef<ReturnType<typeof setTimeout>>();
const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // =========== 桌面同欄拖曳排序 ===========
  const [columnOrder, setColumnOrder] = useState<Record<ColumnType, string[]>>({ request: [], pending: [], received: [], completed: [] });
  const desktopDragRef = useRef<{ orderId: string; colType: ColumnType } | null>(null);

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

  // 決定每個訂單屬於哪一區（樂觀覆蓋優先）
  const getOrderColumn = (order: OrderRequest): ColumnType => {
    if (optimisticCols[order.id]) return optimisticCols[order.id];
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

  // Check if order is stale (>3 days in current column)
  const isStale = (order: OrderRequest, colType: ColumnType): boolean => {
    const dateStr = colType === 'request' ? order.created_at :
                    colType === 'pending' ? order.ordered_at || order.created_at :
                    colType === 'received' ? order.received_at || order.created_at :
                    null;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 3;
  };

  // Send stale notification once per session
  useEffect(() => {
    if (!user?.restaurant_id || loading) return;
    const sent = sessionStorage.getItem('stale_notified');
    if (sent) return;
    const staleOrders = orderRequests.filter(o => {
      const col = getOrderColumn(o);
      return col !== 'completed' && isStale(o, col);
    });
    if (staleOrders.length > 0) {
      sessionStorage.setItem('stale_notified', '1');
      fetch('/api/orders/notify-stale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: user.restaurant_id,
          count: staleOrders.length,
        }),
      }).catch(() => {});
    }
  }, [user?.restaurant_id, loading]);

  const handleDragStart = (e: React.DragEvent, order: OrderRequest) => {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: OrderRequestStatus, targetCol: ColumnType) => {
    e.preventDefault();
    if (draggedOrder && draggedOrder.status !== newStatus) {
      setOptimisticCols(prev => ({ ...prev, [draggedOrder.id]: targetCol }));
      setUpdating(draggedOrder.id);
      try {
        await updateOrderRequestStatus(draggedOrder.id, newStatus);
        setOptimisticCols(prev => {
          const next = { ...prev };
          delete next[draggedOrder.id];
          return next;
        });
      } catch (err) {
        setOptimisticCols(prev => {
          const next = { ...prev };
          delete next[draggedOrder.id];
          return next;
        });
        refetch();
      }
      setUpdating(null);
    }
    setDraggedOrder(null);
  };

  // =========== 手機觸控拖拽 ===========
  const LONG_PRESS_MS = 300;
  const PRESS_FLOAT_MS = 200;

  const startCardPress = (orderId: string, e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setPressedCard(orderId);
    }, PRESS_FLOAT_MS);
  };

  const endCardPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    setPressedCard(null);
  };

  /** 桌面滑鼠長按偵測，類似手機觸控邏輯 */
  const handleMouseDown = (order: OrderRequest, e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只處理左鍵
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    clearTimeout(longPressTimer.current);
    const rect = pageContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    mouseDownPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    longPressTimer.current = setTimeout(() => {
      const originCol = getOrderColumn(order);
      setDragState({ order, overCol: originCol, originCol });
      setIsDragging(true);
      setExpandedOrder(null);
    }, LONG_PRESS_MS);
  };

  const handleMouseUp = () => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;
    if (!dragState) return;
    const targetCol = dragState?.overCol;
    const originCol = dragState?.originCol;
    const draggedOrder = dragState?.order;
    setDragState(null);
    setIsDragging(false);
    if (targetCol && originCol && targetCol !== originCol && draggedOrder) {
      setOptimisticCols(prev => ({ ...prev, [draggedOrder.id]: targetCol as ColumnType }));
      setColumnOrder(prev => {
        const next = { ...prev };
        next[originCol] = (next[originCol] || []).filter(id => id !== draggedOrder.id);
        if (!next[targetCol]) next[targetCol] = [];
        next[targetCol] = [draggedOrder.id, ...next[targetCol]];
        return next;
      });
      updateOrderRequestStatus(draggedOrder.id, dropStatusMap[targetCol]).catch(() => refetch());
    }
  };

  // ★ 安全機制：pressedCard 卡住時自動清除（PWA 觸控 bug 防禦）
  useEffect(() => {
    if (!pressedCard) return;
    const t = setTimeout(() => setPressedCard(null), 500);
    return () => clearTimeout(t);
  }, [pressedCard]);

  // ★ 全域 touchmove / touchend / mousemove / mouseup 監聽
  useEffect(() => {
    if (!dragState && !isDragging) return;

    const onTouchMoveGlobal = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = undefined;
        return;
      }
      e.preventDefault();
      const containerRect = pageContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      const offsetX = touch.clientX - containerRect.left;
      const offsetY = touch.clientY - containerRect.top;
      dragPosRef.current = { x: offsetX, y: offsetY };
      if (floatCloneRef.current) {
        floatCloneRef.current.style.left = `${offsetX - 100}px`;
        floatCloneRef.current.style.top = `${offsetY - 30}px`;
      }
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

    const onTouchEndGlobal = async () => {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
      clearTimeout(pressTimer.current);
      pressTimer.current = undefined;
      setPressedCard(null);

      const targetCol = dragState?.overCol;
      const originCol = dragState?.originCol;
      const draggedOrder = dragState?.order;
      setDragState(null);
      setIsDragging(false);

      if (targetCol && originCol && targetCol !== originCol && draggedOrder) {
        // ★ 樂觀覆蓋：立即把該卡片指定到目標欄位（繞過 getOrderColumn 的 status 判斷）
        setOptimisticCols(prev => ({ ...prev, [draggedOrder.id]: targetCol as ColumnType }));
        setColumnOrder(prev => {
          const next = { ...prev };
          next[originCol] = (next[originCol] || []).filter(id => id !== draggedOrder.id);
          if (!next[targetCol]) next[targetCol] = [];
          next[targetCol] = [draggedOrder.id, ...next[targetCol]];
          return next;
        });

        try {
          await updateOrderRequestStatus(draggedOrder.id, dropStatusMap[targetCol]);
          // API 成功後清除樂觀覆蓋（資料 refetch 後 status 已更新）
          setOptimisticCols(prev => {
            const next = { ...prev };
            delete next[draggedOrder.id];
            return next;
          });
        } catch (err) {
          console.error('❌ 拖曳更新狀態失敗:', err);
          setOptimisticCols(prev => {
            const next = { ...prev };
            delete next[draggedOrder.id];
            return next;
          });
          refetch();
        }
      }
    };

    const onMouseMoveGlobal = (e: MouseEvent) => {
      if (!dragState) return;
      const containerRect = pageContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      const offsetX = e.clientX - containerRect.left;
      const offsetY = e.clientY - containerRect.top;
      dragPosRef.current = { x: offsetX, y: offsetY };
      if (floatCloneRef.current) {
        floatCloneRef.current.style.left = `${offsetX - 100}px`;
        floatCloneRef.current.style.top = `${offsetY - 30}px`;
      }
      if (containerRef.current) {
        const colEls = containerRef.current.children;
        let found: ColumnType | null = null;
        for (let i = 0; i < colEls.length; i++) {
          const rect = colEls[i].getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            const colMap: ColumnType[] = ['request', 'pending', 'received'];
            found = colMap[i] || null;
            break;
          }
        }
        setDragState(prev => prev ? { ...prev, overCol: found } : null);
      }
    };

    document.addEventListener('touchmove', onTouchMoveGlobal, { passive: false });
    document.addEventListener('touchend', onTouchEndGlobal);
    document.addEventListener('mousemove', onMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('touchmove', onTouchMoveGlobal);
      document.removeEventListener('touchend', onTouchEndGlobal);
      document.removeEventListener('mousemove', onMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, isDragging]);
  const handleTouchStart = (order: OrderRequest, e: React.TouchEvent) => {
    e.preventDefault(); // 阻止文字選擇
    const touch = e.touches[0];
    // 先記錄初始位置（以 pageContainer 為基準的 offset）
    const containerRect = pageContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    dragPosRef.current = { x: touch.clientX - containerRect.left, y: touch.clientY - containerRect.top };
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

    // ★ 先記錄拖曳目標，然後立即清除拖曳狀態（移除幻影 + 恢復原始卡片透明度）
    const targetCol = dragState?.overCol;
    const originCol = dragState?.originCol;
    const draggedOrder = dragState?.order;
    setDragState(null);
    setIsDragging(false);

    if (targetCol && originCol && targetCol !== originCol && draggedOrder) {
      // ★ 立即樂觀更新本地資料：將卡片從原區移除
      setColumnOrder(prev => {
        const next = { ...prev };
        next[originCol] = (next[originCol] || []).filter(id => id !== draggedOrder.id);
        if (!next[targetCol]) next[targetCol] = [];
        next[targetCol] = [draggedOrder.id, ...next[targetCol]];
        return next;
      });

      // ★ 非同步更新後端（不影響 UI 響應）
      try {
        await updateOrderRequestStatus(draggedOrder.id, dropStatusMap[targetCol]);
      } catch (err) {
        console.error('❌ 拖曳更新狀態失敗:', err);
        // 更新失敗時重新整理資料
        refetch();
      }
    }
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
    const borderColor = colType === 'request' ? 'border-blue-200' : colType === 'pending' ? 'border-yellow-200' : 'border-green-200';
    return (
      <div
        className={`rounded-xl p-1.5 md:p-2.5 transition-all duration-200 min-w-0 flex-1 ${bgColor} ${dragState?.overCol === colType ? 'ring-2 ring-indigo-400 bg-indigo-50/50 scale-[1.02]' : ''}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, dropStatusMap[colType], colType)}
      >
        <div className="flex items-center justify-between mb-1 md:mb-2 px-0.5">
          <h2 className="font-semibold text-[10px] md:text-sm flex items-center gap-0.5 md:gap-2">{icon} {title}</h2>
          <span className="text-[9px] md:text-xs bg-gray-200 text-gray-600 rounded-full px-1 md:px-2 py-0.5">{columnOrders.length}</span>
        </div>
        <div className="space-y-1 md:space-y-1.5">
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
              const stale = isStale(order, colType);
              return (
                <div
                  key={order.id}
                  ref={el => { if (el) cardRefs.current.set(order.id, el); }}
                  className={`overflow-hidden select-none transition-all duration-200 rounded-lg border ${borderColor} ${isExpanded ? 'border-primary/50 ring-1 ring-primary/20' : ''} ${stale ? (colType === 'request' ? 'border-blue-400 bg-blue-50' : 'border-red-400 bg-red-50') : 'bg-white'} ${dragState?.order.id === order.id ? 'opacity-40 scale-95' : ''} ${isDragging && dragState?.order.id === order.id ? 'shadow-2xl scale-[1.03] ring-2 ring-indigo-400 z-50 relative' : 'hover:shadow-md transition-all duration-200'}`}
                  onMouseDown={(e) => { startCardPress(order.id, e); handleMouseDown(order, e); }}
                  onMouseUp={() => { endCardPress(); handleMouseUp(); }}
                  onMouseLeave={endCardPress}
                  onTouchStart={(e) => { handleTouchStart(order, e); }}
                >
                  <div
                    className="p-1.5 md:p-2.5 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => { endCardPress(); setExpandedOrder(isExpanded ? null : order.id); }}
                  >
                    {/* 預設只顯示貨物名 + 數量（緊密排列） */}
                    <div className="text-[10px] md:text-sm font-medium text-gray-800 leading-tight flex items-baseline gap-0.5 md:gap-1">
                      <span className="truncate">{firstItem?.inventory?.name || order.notes || '未知貨物'}</span>
                      {firstItem && (
                        <span className="text-[8px] md:text-[10px] text-gray-500 font-normal shrink-0">
                          x{firstItem.requested_quantity}{firstItem.inventory?.unit || ''}
                        </span>
                      )}
                    </div>

                    {/* 展開後的詳情（優化排版） */}
                    {/* 逾期提示（收合狀態也可見） */}
                    {stale && (
                      <div className={`mt-1 text-[9px] font-medium flex items-center gap-1 ${colType === 'request' ? 'text-blue-500' : 'text-red-500'}`}>
                        <AlertCircle className="h-2.5 w-2.5" />
                        停留此區逾3天
                      </div>
                    )}
                    {isExpanded && (
                      <div className="mt-1 pt-1 border-t border-dashed border-gray-200 space-y-0.5">
                        {/* 編輯按鈕 + 數量 */}
                        <div className="flex items-center justify-between">
                          {firstItem && (
                            <span className="text-[10px] text-gray-900 font-medium">
                              {firstItem.requested_quantity}{firstItem.inventory?.unit || '件'}
                            </span>
                          )}
                          {can('order.approve') && (
                            <button
                              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleEditRequest(order); }}
                            >
                              <Pencil className="h-2.5 w-2.5" />
                              編輯
                            </button>
                          )}
                        </div>

                        {/* 時間 / 員工 */}
                        <div className="text-[9px] text-gray-400 space-y-0.5">
                          <div className="flex gap-1">
                            <span className="text-gray-500 w-6 shrink-0">申請</span>
                            <span className="truncate">{formatShortDateTime(order.created_at)}</span>
                          </div>
                          <div className="flex gap-1">
                            <span className="text-gray-500 w-6 shrink-0">員工</span>
                            <span className="truncate">{order.employee?.name || '未知'}</span>
                          </div>
                          {colType === 'pending' && order.ordered_at && (
                            <div className="flex gap-1">
                              <span className="text-gray-500 w-6 shrink-0">訂貨</span>
                              <span className="truncate">{formatShortDateTime(order.ordered_at)}</span>
                            </div>
                          )}
                          {colType === 'received' && order.received_at && (
                            <div className="flex gap-1">
                              <span className="text-gray-500 w-6 shrink-0">送達</span>
                              <span className="truncate">{formatShortDateTime(order.received_at)}</span>
                            </div>
                          )}
                        </div>

                        {/* 貨物清單 */}
                        {items.length > 0 && (
                          <div>
                            <div className="text-[9px] text-gray-400 font-medium">貨物</div>
                            {items.map((item: any, idx: number) => (
                              <div key={item.id} className="flex items-center gap-1 text-[9px] py-0.5">
                                <span className="text-gray-700 truncate">{item.inventory?.name || '未知貨物'}</span>
                                <span className="text-gray-500 shrink-0">
                                  x{item.requested_quantity}{item.inventory?.unit || ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 狀態標籤 + 逾期 */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                            order.status === 'pending' ? 'bg-red-100 text-red-700' :
                            order.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'ordered' ? 'bg-yellow-100 text-yellow-700' :
                            order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                            order.status === 'received' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {statusLabel}
                          </span>
                          {stale && (
                            <span className={`text-[9px] ${colType === 'request' ? 'text-blue-500' : 'text-red-500'}`}>停留此區逾3天</span>
                          )}
                        </div>

                        {/* 過往紀錄按鈕（所有欄位通用） */}
                        <button
                          className="w-full py-1 mt-1 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors font-medium flex items-center justify-center gap-1"
                          onClick={(e) => { e.stopPropagation(); setHistoryModalOrder(order); }}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          過往紀錄
                        </button>

                        {/* 簽收按鈕 */}
                        {colType === 'received' && (
                          <button
                            className="w-full py-1 mt-1 text-[10px] bg-green-600 hover:bg-green-700 text-white rounded transition-colors font-medium"
                            onClick={(e) => { e.stopPropagation(); handleOpenSignModal(order); }}
                          >
                            簽收
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
            <div className="space-y-3">
              {(() => {
                // 按年分組
                const yearMap = new Map<string, any[]>();
                for (const o of completedOrders) {
                  const year = o.created_at.slice(0, 4);
                  if (!yearMap.has(year)) yearMap.set(year, []);
                  yearMap.get(year)!.push(o);
                }
                const years = Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

                return years.map(([year, yearOrders]) => {
                  // 按月分組
                  const monthMap = new Map<string, any[]>();
                  for (const o of yearOrders) {
                    const month = o.created_at.slice(5, 7);
                    if (!monthMap.has(month)) monthMap.set(month, []);
                    monthMap.get(month)!.push(o);
                  }
                  const months = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                  const yearTotal = yearOrders.length;

                  return (
                    <div key={year} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
                        <span className="font-bold text-gray-700 text-sm">{year} 年</span>
                        <span className="text-xs text-gray-500">{yearTotal} 項</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {months.map(([month, monthOrders]) => (
                          <div key={month}>
                            <div className="bg-gray-50 px-4 py-1.5 text-xs text-gray-500 font-medium">
                              {monthNames[parseInt(month)]}（{monthOrders.length} 項）
                            </div>
                            <div className="space-y-1 px-2 pb-2">
                              {monthOrders.map(order => {
                                const items = order.items || [];
                                const item = items[0];
                                const orderedQty = item?.requested_quantity || 0;
                                const receivedQty = item?.received_quantity;
                                const unit = item?.inventory?.unit || '';
                                const isMatch = receivedQty != null && receivedQty === orderedQty;
                                const isRejected = order.status === 'rejected';
                                const isDetailOpen = completedDetailOrder === order.id;

                                return (
                                  <div key={order.id}>
                                    <div
                                      onClick={() => setCompletedDetailOrder(isDetailOpen ? null : order.id)}
                                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors mt-1"
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${isDetailOpen ? '' : '-rotate-90'}`} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-gray-800 truncate">{order.notes || item?.inventory?.name || '無備註'}</p>
                                          <p className="text-[10px] text-gray-400 truncate">{order.employee?.name || '未知'} · {formatShortDateTime(order.created_at)}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                                        {isRejected ? (
                                          <Badge variant="destructive" className="text-[9px]">已拒絕</Badge>
                                        ) : (
                                          <>
                                            <span className="text-gray-500">訂 {orderedQty}{unit}</span>
                                            {receivedQty != null && (
                                              <span className="text-gray-500">收 {receivedQty}{unit}</span>
                                            )}
                                            {!isRejected && (isMatch
                                              ? <CheckCircle className="h-3 w-3 text-green-500" />
                                              : <AlertCircle className="h-3 w-3 text-amber-500" />
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {isDetailOpen && (
                                      <div className="bg-white border border-gray-100 rounded-lg mx-1 mb-1 p-2.5 space-y-1.5 text-[10px]">
                                        <div className="font-medium text-gray-700 flex items-center justify-between">
                                          <span>📋 訂單時間軸</span>
                                          <button onClick={(e) => { e.stopPropagation(); setHistoryModalOrder(order); }}
                                            className="text-primary hover:underline flex items-center gap-1 text-[10px]">
                                            <Clock className="h-2.5 w-2.5" /> 過往紀錄
                                          </button>
                                        </div>
                                        <div className="space-y-1">
                                          <TimelineRow label="📝 員工請求" date={order.created_at} zone="request" />
                                          {order.ordered_at && <TimelineRow label="🔄 待處理" date={order.ordered_at} zone="pending" />}
                                          {order.received_at && <TimelineRow label="📦 已送到" date={order.received_at} zone="received" />}
                                          <TimelineRow label="✅ 已完成" date={order.updated_at || order.created_at} zone="completed" />
                                        </div>
                                        {items.length > 0 && (
                                          <div className="border-t pt-1 mt-1">
                                            <div className="text-[9px] text-gray-400 mb-0.5">貨物清單</div>
                                            {items.map((itm: any) => (
                                              <div key={itm.id} className="flex justify-between text-[10px] text-gray-600">
                                                <span>{itm.inventory?.name || '未知貨物'}</span>
                                                <span>訂 {itm.requested_quantity}{itm.inventory?.unit || ''}{itm.received_quantity != null && ` → 收 ${itm.received_quantity}`}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );

  return (
    <div ref={pageContainerRef} className="relative p-2 md:p-4 space-y-2 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">訂貨管理</h1>
          <p className="text-sm text-muted-foreground">訂貨單看板 · 庫存管理</p>
        </div>
        <div className="flex items-center gap-2">
          {can('order.create') && activeTab === 'orders' && (
            <Button onClick={() => setShowRequestModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              訂貨請求
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {[
          { key: 'orders' as OrderTab, label: '訂貨單看板', icon: ClipboardList },
          { key: 'inventory' as OrderTab, label: '庫存管理', icon: Box },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ===== ORDERS KANBAN TAB ===== */}
      {activeTab === 'orders' && (<>
      <div
        ref={containerRef}
        className={`flex gap-1 md:gap-3 ${isDragging ? 'overflow-hidden touch-none' : ''}`}
      >
        {renderColumn('員工請求', 'request', <AlertCircle className="w-5 h-5 text-blue-500"/>, 'bg-blue-50')}
        {renderColumn('待處理', 'pending', <Clock className="w-5 h-5 text-yellow-500"/>, 'bg-yellow-50')}
        {renderColumn('已送到', 'received', <PackageCheck className="w-5 h-5 text-green-500"/>, 'bg-green-50')}
      </div>

      {/* 浮起的拖拽卡片克隆 — Portal 到頁面容器，absolute + relative 定位讓它隨頁面滾動 */}
      {dragState && pageContainerRef.current && createPortal(
        <div
          ref={floatCloneRef}
          className="absolute pointer-events-none z-50"
          style={{
            left: (dragPosRef.current.x) - 100,
            top: (dragPosRef.current.y) - 30,
            width: 200,
          }}
        >
          <Card className="shadow-2xl scale-[1.03] ring-2 ring-indigo-400 rotate-1 opacity-95 bg-white">
            <div className="p-2.5 text-sm font-medium text-gray-800 truncate">
              {dragState.order.items?.[0]?.inventory?.name || dragState.order.notes || '未知貨物'}
            </div>
          </Card>
        </div>,
        pageContainerRef.current
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
                  {['全部', ...DEFAULT_CATEGORIES].map((cat) => (
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
      </>)}
      
      {/* ===== INVENTORY TAB ===== */}
      {activeTab === 'inventory' && (
        <InventoryTab
          inventory={inventory}
          loading={inventoryLoading}
          refetch={refetchInv}
          updateInventory={updateInventory}
          addInventory={addInventory}
          can={can}
        />
      )}

      {/* ===== 過往紀錄 Modal ===== */}
      {historyModalOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHistoryModalOrder(null)}>
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="sticky top-0 bg-white z-10 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">📋 過往紀錄</CardTitle>
                <button onClick={() => setHistoryModalOrder(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-gray-600">
                {historyModalOrder.notes || historyModalOrder.items?.[0]?.inventory?.name || '此訂單'}
              </p>
              {(() => {
                const name = historyModalOrder.items?.[0]?.inventory?.name || '';
                const related = orderRequests.filter(o =>
                  o.id !== historyModalOrder.id &&
                  o.items?.some(i => name && i.inventory?.name === name)
                );
                if (related.length === 0 && !name) {
                  // Fallback: show same status changes
                  const sameStatus = orderRequests.filter(o =>
                    o.id !== historyModalOrder.id &&
                    o.status === historyModalOrder.status
                  ).slice(0, 10);
                  if (sameStatus.length === 0) {
                    return <p className="text-xs text-gray-400 text-center py-4">暫無相關過往紀錄</p>;
                  }
                  return (
                    <div className="space-y-1.5">
                      <p className="text-xs text-gray-500 font-medium">同狀態訂單（最近 10 項）</p>
                      {sameStatus.map(o => (
                        <TimelineRow key={o.id} label={o.notes || o.items?.[0]?.inventory?.name || '訂單'} date={o.created_at} zone={getOrderColumn(o)} />
                      ))}
                    </div>
                  );
                }
                if (related.length === 0) {
                  return <p className="text-xs text-gray-400 text-center py-4">暫無相關過往紀錄</p>;
                }
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500 font-medium">同一貨物的所有訂單記錄（共 {related.length + 1} 筆，含本次）</p>
                    {[historyModalOrder, ...related].map(o => (
                      <div key={o.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{formatShortDateTime(o.created_at)}</span>
                          <Badge variant="outline" className="text-[10px]">{getStatusLabel(o.status)}</Badge>
                        </div>
                        <div className="text-[10px] text-gray-500 space-y-0.5">
                          <span>📝 員工請求: {formatDate(o.created_at)}</span>
                          {o.ordered_at && <span>🔄 待處理: {formatDate(o.ordered_at)}</span>}
                          {o.received_at && <span>📦 已送到: {formatDate(o.received_at)}</span>}
                          {o.status === 'received' && <span>✅ 已完成: {formatDate(o.updated_at)}</span>}
                          {o.status === 'rejected' && <span>❌ 已拒絕: {formatDate(o.updated_at)}</span>}
                        </div>
                        {o.items && o.items.length > 0 && (
                          <div className="mt-1 text-[10px] text-gray-400 border-t pt-1">
                            {o.items.map((itm: any) => (
                              <span key={itm.id} className="mr-2">
                                {itm.inventory?.name || '貨物'} x{itm.requested_quantity}
                                {itm.received_quantity != null ? `(收${itm.received_quantity})` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ===== INVENTORY TAB =====
function InventoryTab({
  inventory,
  loading,
  refetch,
  updateInventory,
  addInventory,
  can,
}: {
  inventory: Inventory[]
  loading: boolean
  refetch: () => void
  updateInventory: (id: string, data: Record<string, any>) => Promise<any>
  addInventory: (data: any) => Promise<any>
  can: (perm: PermissionKey) => boolean
}) {
  const { user } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [saving, setSaving] = useState(false)
  const firstCat = DEFAULT_CATEGORIES[0] || '糖水配料'
  const [formData, setFormData] = useState({
    category: firstCat, name: '', unit: '包', current_stock: 0, min_stock_level: 10, supplier: '',
  })
  // ===== Category management =====
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editingCatValue, setEditingCatValue] = useState('')

  const allCategories = useMemo(() => {
    const set = new Set([...DEFAULT_CATEGORIES, ...customCategories])
    return Array.from(set)
  }, [customCategories])

  const CAT_SETTINGS_KEY = 'inventory_categories'

  // Load custom categories from settings
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user?.restaurant_id) return
      try {
        const { data } = await supabase
          .from('settings')
          .select('setting_value')
          .eq('restaurant_id', user.restaurant_id)
          .eq('setting_key', CAT_SETTINGS_KEY)
          .maybeSingle()
        if (!cancelled && data?.setting_value) {
          try {
            const parsed = JSON.parse(data.setting_value)
            if (Array.isArray(parsed)) setCustomCategories(parsed)
          } catch { /* ignore bad json */ }
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setCatLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.restaurant_id])

  const saveCategories = async (cats: string[]) => {
    if (!user?.restaurant_id) return
    setCatSaving(true)
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('restaurant_id', user.restaurant_id)
        .eq('setting_key', CAT_SETTINGS_KEY)
        .maybeSingle()
      const payload = { setting_value: JSON.stringify(cats), updated_at: new Date().toISOString() }
      if (existing) {
        await supabase.from('settings').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('settings').insert([{
          restaurant_id: user.restaurant_id,
          setting_key: CAT_SETTINGS_KEY,
          setting_value: JSON.stringify(cats),
          setting_type: 'json',
        }])
      }
    } catch (err) {
      console.error('Save categories error:', err)
    } finally {
      setCatSaving(false)
    }
  }

  const handleAddCategory = async () => {
    const name = newCatName.trim()
    if (!name || allCategories.includes(name)) return
    const updated = [...customCategories, name]
    setCustomCategories(updated)
    setNewCatName('')
    await saveCategories(updated)
  }

  const handleRemoveCategory = async (cat: string) => {
    if (DEFAULT_CATEGORIES.includes(cat)) return // cannot remove default
    const updated = customCategories.filter(c => c !== cat)
    setCustomCategories(updated)
    if (selectedCategory === cat) setSelectedCategory('全部')
    await saveCategories(updated)
  }

  const handleRenameCategory = async () => {
    if (!editingCat || !editingCatValue.trim()) return
    const newName = editingCatValue.trim()
    if (newName === editingCat) { setEditingCat(null); return }

    // Update the category in all places: customCategories list + any inventory items using old name
    const updatedCustom = customCategories.map(c => c === editingCat ? newName : c)
    setCustomCategories(updatedCustom)
    setEditingCat(null)

    // Also update any inventory items that use the old category name
    const itemsToUpdate = inventory.filter(i => i.category === editingCat)
    for (const item of itemsToUpdate) {
      await updateInventory(item.id, { category: newName })
    }

    await saveCategories(updatedCustom)
    refetch()
  }

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const lowStockItems = inventory.filter(item => item.current_stock < item.min_stock_level)

  const handleEdit = (item: Inventory) => {
    setEditingItem(item)
    setFormData({
      category: item.category, name: item.name, unit: item.unit,
      current_stock: item.current_stock, min_stock_level: item.min_stock_level, supplier: item.supplier || '',
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({ category: '糖水配料', name: '', unit: '包', current_stock: 0, min_stock_level: 10, supplier: '' })
  }

  const handleDeleteItem = async () => {
    if (!editingItem) return
    if (!confirm(`確定刪除「${editingItem.name}」？此操作無法復原。`)) return
    setSaving(true)
    try {
      const { error } = await supabase.from('inventory').delete().eq('id', editingItem.id)
      if (error) throw error
      setShowModal(false)
      setEditingItem(null)
      resetForm()
      refetch()
    } catch (err) {
      console.error('Delete inventory error:', err)
      alert('刪除失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) return
    setSaving(true)
    try {
      if (editingItem) {
        await updateInventory(editingItem.id, {
          ...formData, last_updated: new Date().toISOString(),
        })
      } else {
        await addInventory(formData)
      }
      setShowModal(false)
      setEditingItem(null)
      resetForm()
      refetch()
    } catch (err) {
      console.error('Save inventory error:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Low stock alert */}


      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="搜尋貨物名稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          <Button variant={selectedCategory === '全部' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('全部')}>
            全部 ({inventory.length})
          </Button>
          {allCategories.map(cat => {
            const count = inventory.filter(i => i.category === cat).length
            return (
              <Button key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat)}>
                {cat} ({count})
              </Button>
            )
          })}
          {!catLoading && (
            <Button variant="outline" size="sm" onClick={() => setShowCatModal(true)} className="text-gray-500">
              <Tags className="h-3.5 w-3.5 mr-1" />管理分類
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true) }}>
          <Plus className="h-4 w-4 mr-1" />新增貨物
        </Button>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>貨物名稱</TableHead>
                <TableHead className="hidden md:table-cell">類別</TableHead>
                <TableHead>庫存</TableHead>
                <TableHead className="hidden md:table-cell">最低</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="hidden md:table-cell">供應商</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map(item => {
                const isLow = item.current_stock < item.min_stock_level
                return (
                  <TableRow key={item.id} className={isLow ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-medium text-xs md:text-sm">{item.name}</TableCell>
                    <TableCell className="hidden md:table-cell"><Badge variant="secondary">{item.category}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-xs md:text-sm">
                      <span className={isLow ? 'text-yellow-600 font-medium' : ''}>{item.current_stock}<span className="hidden md:inline"> {item.unit}</span></span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs md:text-sm">{item.min_stock_level} {item.unit}</TableCell>
                    <TableCell className="text-xs md:text-sm">
                      {isLow ? (
                        <Badge variant="warning" className="flex items-center gap-0.5 md:gap-1 text-[10px] md:text-xs whitespace-nowrap"><AlertCircle className="h-2.5 w-2.5 md:h-3 md:w-3" />不足</Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px] md:text-xs">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-gray-500 text-xs md:text-sm">{item.supplier || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 md:h-9 md:w-9" onClick={() => handleEdit(item)}><Pencil className="h-3 w-3 md:h-4 md:w-4" /></Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== Category Management Modal ===== */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCatModal(false)}>
          <Card className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Tags className="h-4 w-4" />管理庫存分類</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing categories */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {allCategories.map(cat => {
                  const isEditing = editingCat === cat
                  const isDefault = DEFAULT_CATEGORIES.includes(cat)
                  return (
                    <div key={cat} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      {isEditing ? (
                        <Input
                          value={editingCatValue}
                          onChange={e => setEditingCatValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameCategory(); if (e.key === 'Escape') setEditingCat(null) }}
                          className="h-8 text-sm flex-1 mr-2"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm flex-1 cursor-pointer hover:text-blue-600" onClick={() => { setEditingCat(cat); setEditingCatValue(cat) }}>
                          {cat}
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {isEditing ? (
                          <button onClick={handleRenameCategory} className="p-1 rounded hover:bg-blue-100 text-blue-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => { setEditingCat(cat); setEditingCatValue(cat) }} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {!isDefault && !isEditing && (
                          <button onClick={() => handleRemoveCategory(cat)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )                        }
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Add new category */}
              <div className="flex gap-2">
                <Input
                  placeholder="新分類名稱"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddCategory} disabled={!newCatName.trim() || catSaving}>
                  {catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '新增'}
                </Button>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setShowCatModal(false)}>完成</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle>{editingItem ? '編輯貨物' : '新增貨物'}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">類別</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">貨物名稱</label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">現有庫存</label>
                    <Input type="number" value={formData.current_stock} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">單位</label>
                    <Input value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">最低庫存</label>
                    <Input type="number" value={formData.min_stock_level} onChange={e => setFormData({ ...formData, min_stock_level: Number(e.target.value) })} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">供應商</label>
                    <Input value={formData.supplier} onChange={e => setFormData({ ...formData, supplier: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-between gap-2 pt-4">
                  <div>
                    {editingItem && (
                      <Button type="button" variant="destructive" size="sm" onClick={handleDeleteItem} disabled={saving}>
                        <Trash2 className="h-4 w-4 mr-1" />刪除
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowModal(false)}>取消</Button>
                    <Button type="submit" disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingItem ? '儲存' : '新增'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ===== 時間軸元件 =====
function TimelineRow({ label, date, zone }: { label: string; date: string; zone: string }) {
  const zoneColors: Record<string, string> = {
    request: 'border-l-blue-400 bg-blue-50',
    pending: 'border-l-yellow-400 bg-yellow-50',
    received: 'border-l-green-400 bg-green-50',
    completed: 'border-l-gray-400 bg-gray-50',
  };
  const color = zoneColors[zone] || 'border-l-gray-300 bg-gray-50';
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded border-l-4 ${color}`}>
      <span className="text-xs text-gray-700">{label}</span>
      <span className="text-[10px] text-gray-500 font-mono">{new Date(date).toLocaleString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
    </div>
  );
}
