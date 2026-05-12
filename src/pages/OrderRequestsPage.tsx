import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useOrderRequests } from '@/hooks/useSupabaseData';
import type { OrderRequest, OrderRequestStatus } from '@/types';

export function OrderRequestsPage() {
  const { orderRequests, loading, updateOrderRequestStatus } = useOrderRequests();
  const [draggedOrder, setDraggedOrder] = useState<OrderRequest | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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

  // Map order_request status to kanban columns
  const getStatusForColumn = (status: OrderRequestStatus): 'request' | 'pending' | 'completed' => {
    if (status === 'pending' || status === 'approved') return 'request';
    if (status === 'ordered' || status === 'partial') return 'pending';
    if (status === 'received' || status === 'rejected') return 'completed';
    return 'request';
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
            columnOrders.map(order => (
              <Card 
                key={order.id} 
                draggable 
                onDragStart={(e) => handleDragStart(e, order)}
                className={`cursor-move hover:shadow-md transition-shadow active:cursor-grabbing ${updating === order.id ? 'opacity-50' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold">{order.notes || '無備註'}</p>
                    <Package className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">申請人: {order.employee?.name || '未知'}</p>
                  <p className="text-xs text-gray-400 mt-1">狀態: {order.status}</p>
                </CardContent>
              </Card>
            ))
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">訂貨與訂單管理 (Kanban)</h1>
        <p className="text-muted-foreground">拖曳卡片以更改訂貨請求狀態</p>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4">
        {renderColumn('員工請求 (Request)', 'request', <AlertCircle className="w-5 h-5 text-red-500"/>, 'bg-red-50')}
        {renderColumn('待處理 (Pending)', 'pending', <Clock className="w-5 h-5 text-yellow-500"/>, 'bg-yellow-50')}
        {renderColumn('已完成 (Completed)', 'completed', <CheckCircle className="w-5 h-5 text-green-500"/>, 'bg-green-50')}
      </div>
    </div>
  );
}
