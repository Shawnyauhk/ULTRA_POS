import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

let toastListeners: Array<(msg: ToastMessage) => void> = [];

export function showToast(type: ToastType, title: string, message?: string) {
  const msg: ToastMessage = { id: Date.now().toString(), type, title, message };
  toastListeners.forEach(fn => fn(msg));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id));
      }, 3000);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter(fn => fn !== listener); };
  }, []);

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => {
        const colors = toast.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-800'
          : toast.type === 'error'
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-blue-50 border-blue-200 text-blue-800';
        const Icon = toast.type === 'success' ? CheckCircle2 : AlertCircle;
        return (
          <div key={toast.id} className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${colors} animate-in slide-in-from-right`}>
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{toast.title}</p>
              {toast.message && <p className="text-xs opacity-80 mt-0.5">{toast.message}</p>}
            </div>
            <button onClick={() => remove(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
