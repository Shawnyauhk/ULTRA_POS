import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare, Send, Loader2, BookOpen, History, Plus, X,
  CheckCircle, XCircle, Trash2, ChevronDown, ChevronRight,
  Clock, User, Bot, Search, AlertCircle, PenSquare, Wifi, WifiOff
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import { sendAIChatMessage, fetchSessions, fetchSessionMessages, closeSession, deleteSession, fetchKnowledgeBase, saveKnowledgeEntry, deleteKnowledgeEntry } from '@/lib/ai-chat';
import type { ChatMessage, AISession, AIKnowledgeBase } from '@/types';

type TabType = 'chat' | 'sessions' | 'knowledge';

export function AIChatPage() {
  const { user } = useAuthStore();
  const { can } = usePermission();
  const restaurantId = user?.restaurant_id || '';

  const [activeTab, setActiveTab] = useState<TabType>('chat');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            AI 客服管理
          </h1>
          <p className="text-muted-foreground">AI 客服對話測試、會話記錄管理與知識庫維護</p>
        </div>
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        {can('ai.customer_service') && (
          <Button
            variant={activeTab === 'chat' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('chat')}
            className="gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            AI 客服對話
          </Button>
        )}
        {can('ai.session_logs') && (
          <Button
            variant={activeTab === 'sessions' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('sessions')}
            className="gap-2"
          >
            <History className="w-4 h-4" />
            客人會話記錄
          </Button>
        )}
        {can('ai.knowledge_base') && (
          <Button
            variant={activeTab === 'knowledge' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('knowledge')}
            className="gap-2"
          >
            <BookOpen className="w-4 h-4" />
            知識庫管理
          </Button>
        )}
      </div>

      {activeTab === 'chat' && <ChatPlayground restaurantId={restaurantId} />}
      {activeTab === 'sessions' && <SessionsManager restaurantId={restaurantId} />}
      {activeTab === 'knowledge' && <KnowledgeBaseManager restaurantId={restaurantId} />}
    </div>
  );
}

// ========== AI 客服對話測試 ==========
function ChatPlayground({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化 session
  useEffect(() => {
    if (!sessionId) {
      setSessionId(crypto.randomUUID());
    }
  }, [sessionId]);

  // 自動捲到最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !restaurantId || !sessionId) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await sendAIChatMessage({
        message: text,
        sessionId,
        restaurantId,
        customerName: `管理員 (${user?.name || '後台'})`,
        history: messages.slice(-10),
      });

      if (res.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
        setConnectionOk(true);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ AI 回覆失敗，請稍後重試。' }]);
      }
    } catch (err) {
      console.error('AI 客服錯誤:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ 連線失敗，請檢查後端服務是否正常。' }]);
      setConnectionOk(false);
    } finally {
      setLoading(false);
    }
  }, [input, loading, restaurantId, sessionId, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewSession = () => {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左側: 對話區域 */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="flex flex-col h-[600px]">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  AI 客服對話測試
                </CardTitle>
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  connectionOk === null ? 'bg-gray-100 text-gray-500' :
                  connectionOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {connectionOk === null ? <Wifi className="w-3 h-3" /> :
                   connectionOk ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {connectionOk === null ? '未測試' : connectionOk ? '已連線' : '連線異常'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleNewSession}>
                <Plus className="w-4 h-4 mr-1" /> 新對話
              </Button>
            </div>
            <CardDescription>管理員可在這裡模擬客人提問，測試 AI 客服回覆效果</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            {/* 訊息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                  <MessageSquare className="w-12 h-12" />
                  <p className="text-sm">輸入訊息開始測試 AI 客服</p>
                  <p className="text-xs">系統會自動結合知識庫內容回覆</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 輸入區域 */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="輸入模擬客人問題… (Enter 發送，Shift+Enter 換行)"
                  disabled={loading}
                  className="flex-1"
                />
                <Button onClick={handleSend} disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 右側: 使用提示 */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PenSquare className="w-4 h-4" />
              使用說明
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-2">
            <p>🔹 輸入你想測試的客人問題，AI 會以客服身份回覆</p>
            <p>🔹 AI 會自動查詢知識庫來回答常見問題</p>
            <p>🔹 如果回覆不理想，可到「知識庫管理」補充資料</p>
            <p>🔹 客人實際對話會記錄在「會話記錄」中</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" />
              常見測試問題
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {['營業時間係幾點？', '你哋有冇素食選擇？', '點樣落單？', '外賣自取有冇折扣？'].map((q, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-auto py-2"
                onClick={() => {
                  setInput(q);
                }}
              >
                {q}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== 客人會話記錄 ==========
function SessionsManager({ restaurantId }: { restaurantId: string }) {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<AISession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetchSessions(restaurantId);
      if (res.success) setSessions(res.data || []);
    } catch (err) {
      console.error('獲取會話列表失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = async (session: AISession) => {
    setSelectedSession(session);
    setLoadingMessages(true);
    try {
      const res = await fetchSessionMessages(session.id);
      if (res.success) setSessionMessages(res.data || []);
    } catch (err) {
      console.error('獲取會話訊息失敗:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCloseSession = async (id: string) => {
    try {
      await closeSession(id);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'closed' } : s));
    } catch (err) {
      console.error('關閉會話失敗:', err);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('確定刪除此會話？此操作不可撤銷。')) return;
    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selectedSession?.id === id) setSelectedSession(null);
    } catch (err) {
      console.error('刪除會話失敗:', err);
    }
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const closedSessions = sessions.filter(s => s.status === 'closed');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左側: 會話列表 */}
      <div className="lg:col-span-1">
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5" />
                會話列表
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadSessions} disabled={loading}>
                <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                暫無會話記錄
              </div>
            ) : (
              <div className="space-y-1">
                {activeSessions.length > 0 && (
                  <div className="px-2 py-1 text-xs font-semibold text-green-600 uppercase flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> 進行中 ({activeSessions.length})
                  </div>
                )}
                {activeSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isSelected={selectedSession?.id === session.id}
                    onSelect={() => handleSelectSession(session)}
                    onClose={() => handleCloseSession(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                  />
                ))}
                {closedSessions.length > 0 && (
                  <div className="px-2 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> 已關閉 ({closedSessions.length})
                  </div>
                )}
                {closedSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isSelected={selectedSession?.id === session.id}
                    onSelect={() => handleSelectSession(session)}
                    onDelete={() => handleDeleteSession(session.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 右側: 會話詳情 */}
      <div className="lg:col-span-2">
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="border-b pb-3">
            {selectedSession ? (
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    與 {selectedSession.customer_name || '匿名客人'} 的對話
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      selectedSession.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {selectedSession.status === 'active' ? '進行中' : '已關閉'}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {selectedSession.message_count} 則訊息
                    {selectedSession.summary && ` · ${selectedSession.summary}`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedSession.status === 'active' && (
                    <Button variant="outline" size="sm" onClick={() => handleCloseSession(selectedSession.id)}>
                      <CheckCircle className="w-4 h-4 mr-1" /> 關閉
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteSession(selectedSession.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <CardTitle className="text-lg">對話詳情</CardTitle>
                <CardDescription>選擇左側的會話來檢視內容</CardDescription>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4">
            {loadingMessages ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !selectedSession ? (
              <div className="text-center py-16 text-gray-400 space-y-3">
                <MessageSquare className="w-12 h-12 mx-auto" />
                <p className="text-sm">請從左側選擇一個會話</p>
              </div>
            ) : sessionMessages.length === 0 ? (
              <div className="text-center py-16 text-gray-400 space-y-3">
                <AlertCircle className="w-10 h-10 mx-auto" />
                <p className="text-sm">此會話暫無訊息</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessionMessages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SessionCard({
  session, isSelected, onSelect, onClose, onDelete
}: {
  session: AISession;
  isSelected: boolean;
  onSelect: () => void;
  onClose?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg cursor-pointer transition-colors border ${
        isSelected
          ? 'bg-blue-50 border-blue-200'
          : 'hover:bg-gray-50 border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {session.customer_name || '匿名客人'}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              session.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {session.status === 'active' ? '進行中' : '已關閉'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <MessageSquare className="w-3 h-3" />
            <span>{session.message_count} 則</span>
            <Clock className="w-3 h-3 ml-1" />
            <span>{new Date(session.updated_at || session.created_at).toLocaleDateString('zh-HK')}</span>
          </div>
          {session.summary && (
            <p className="text-xs text-gray-600 mt-1 truncate">{session.summary}</p>
          )}
        </div>
        <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
          {onClose && session.status === 'active' && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} title="關閉會話">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDelete} title="刪除會話">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ========== 知識庫管理 ==========
function KnowledgeBaseManager({ restaurantId }: { restaurantId: string }) {
  const [entries, setEntries] = useState<AIKnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AIKnowledgeBase | null>(null);
  const [form, setForm] = useState({ category: '一般', question: '', answer: '' });
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const loadEntries = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetchKnowledgeBase(restaurantId);
      if (res.success) setEntries(res.data || []);
    } catch (err) {
      console.error('獲取知識庫失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const categories = [...new Set(entries.map(e => e.category))];
  const filteredEntries = filterCategory === 'all'
    ? entries
    : entries.filter(e => e.category === filterCategory);

  const handleAdd = () => {
    setEditingEntry(null);
    setForm({ category: '一般', question: '', answer: '' });
    setShowForm(true);
  };

  const handleEdit = (entry: AIKnowledgeBase) => {
    setEditingEntry(entry);
    setForm({ category: entry.category, question: entry.question, answer: entry.answer });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    try {
      await saveKnowledgeEntry({
        id: editingEntry?.id,
        restaurant_id: restaurantId,
        category: form.category,
        question: form.question.trim(),
        answer: form.answer.trim(),
      });
      setShowForm(false);
      setEditingEntry(null);
      await loadEntries();
    } catch (err) {
      console.error('儲存失敗:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此條目？')) return;
    try {
      await deleteKnowledgeEntry(id);
      await loadEntries();
    } catch (err) {
      console.error('刪除失敗:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* 工具列 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              variant={filterCategory === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterCategory('all')}
            >
              全部 ({entries.length})
            </Button>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={filterCategory === cat ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterCategory(cat)}
              >
                {cat} ({entries.filter(e => e.category === cat).length})
              </Button>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-1" /> 新增條目
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 知識庫列表 */}
        <div className="lg:col-span-2">
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                知識庫條目
              </CardTitle>
              <CardDescription>管理 AI 客服用於回答問題的參考資料</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="text-center py-16 text-gray-400 space-y-3">
                  <BookOpen className="w-12 h-12 mx-auto" />
                  <p className="text-sm">暫無知識庫條目</p>
                  <Button variant="outline" size="sm" onClick={handleAdd}>新增第一條</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEntries.map(entry => (
                    <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              {entry.category}
                            </span>
                            {!entry.is_active && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                已停用
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-sm mt-1">Q: {entry.question}</p>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">A: {entry.answer}</p>
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7" onClick={() => handleEdit(entry)}>
                            <PenSquare className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 新增/編輯表單 */}
        <div>
          {showForm && (
            <Card>
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {editingEntry ? '編輯條目' : '新增條目'}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowForm(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">分類</label>
                  <Input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="如：營業資訊、餐點、外送等"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">常見問題</label>
                  <Input
                    value={form.question}
                    onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                    placeholder="客人通常會問的問題"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">AI 回覆內容</label>
                  <Textarea
                    value={form.answer}
                    onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
                    placeholder="你想讓 AI 如何回覆此問題"
                    rows={6}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={saving || !form.question.trim() || !form.answer.trim()}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                  {editingEntry ? '更新條目' : '新增條目'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
