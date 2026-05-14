import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types';

export function AIChatPage() {
  const [chatLogs, setChatLogs] = useState<ChatMessage[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    const fetchChatLogs = async () => {
      setLoadingLogs(true);
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setChatLogs(data);
        }
      } catch (err) {
        console.error('Error fetching chat logs:', err);
      } finally {
        setLoadingLogs(false);
      }
    };
    fetchChatLogs();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI 客服管理</h1>
        <p className="text-muted-foreground">管理客服知識庫與回覆記錄</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /> AI 客服日誌</CardTitle>
            <CardDescription>查看並修正客服回覆，持續訓練 AI 知識庫</CardDescription>
          </div>
          <Button variant="outline"><BookOpen className="w-4 h-4 mr-2" /> 知識庫管理 (Knowledge Base)</Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : chatLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                暫無客服日誌
              </div>
            ) : (
              chatLogs.map(log => (
                <div key={log.id} className="border p-4 rounded-lg bg-gray-50 flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-bold text-gray-700">
                      Q: {log.role === 'user' ? log.content : ''}
                    </p>
                    <p className="text-sm text-blue-700">
                      A: {log.role === 'assistant' ? log.content : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end ml-4 shrink-0">
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                      已記錄
                    </span>
                    <Button variant="ghost" size="sm" className="text-primary">修正答案</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
