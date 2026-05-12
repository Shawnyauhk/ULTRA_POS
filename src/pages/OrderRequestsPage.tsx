import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Order {
  id: string;
  item: string;
  requester: string;
  status: 'request' | 'pending' | 'completed';
}

const INITIAL_ORDERS: Order[] = [
  { id: '1', item: '鮮奶 3箱', requester: 'Shawn (天水圍)', status: 'request' },
  { id: '2', item: '外賣紙袋 500個', requester: 'Admin', status: 'pending' },
  { id: '3', item: '雞蛋 5盤', requester: 'YuenLong', status: 'completed' },
];

export function OrderRequestsPage() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);

  const handleDragStart = (e: React.DragEvent, order: Order) => {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: Order['status']) => {
    e.preventDefault();
    if (draggedOrder && draggedOrder.status !== status) {
      setOrders(orders.map(o => o.id === draggedOrder.id ? { ...o, status } : o));
    }
    setDraggedOrder(null);
  };

  const renderColumn = (title: string, status: Order['status'], icon: React.ReactNode, bgColor: string) => {
    const columnOrders = orders.filter(o => o.status === status);
    return (
      <div 
        className={`flex-1 flex flex-col min-h-[500px] rounded-xl p-4 transition-colors ${bgColor}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="font-bold text-lg flex items-center gap-2">{icon} {title}</h2>
          <Badge variant="secondary">{columnOrders.length}</Badge>
        </div>
        <div className="flex-1 space-y-3">
          {columnOrders.map(order => (
            <Card 
              key={order.id} 
              draggable 
              onDragStart={(e) => handleDragStart(e, order)}
              className="cursor-move hover:shadow-md transition-shadow active:cursor-grabbing"
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-bold">{order.item}</p>
                  <Package className="w-4 h-4 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">申請人: {order.requester}</p>
              </CardContent>
            </Card>
          ))}
          {columnOrders.length === 0 && (
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
