import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare, BookOpen, Settings, Bot, User,
  Plus, Trash2, Save, ChevronDown, ChevronUp,
  Search, X, Loader2, CheckCircle2, AlertCircle,
  Clock, CalendarDays, FileText, Globe, Headphones, ThumbsUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';
import {
  fetchSessions, fetchSessionMessages, closeSession, deleteSession,
  fetchKnowledgeBase, saveKnowledgeEntry, deleteKnowledgeEntry,
  fetchAIConfig, updateAIConfig, submitSuggestion,
} from '@/lib/ai-chat';
import { AICustomerChat } from '@/pages/AICustomerChat';
import type { AISession, ChatMessage, AIKnowledgeBase, AIConfigEntry } from '@/types';

type TabType = 'chat' | 'sessions' | 'knowledge' | 'config';

function getRestaurantId(): string {
  const user = useAuthStore.getState().user;
  return user?.restaurant_id || FALLBACK_RESTAURANT_ID;
}

export function AIChatPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const restaurantId = getRestaurantId();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI 客服管理</h1>
        <p className="text-muted-foreground">管理客服對話、知識庫與 AI 設定</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {[
          { id: 'chat' as TabType, label: '在线客服', icon: Headphones },
          { id: 'sessions' as TabType, label: '對話紀錄', icon: MessageSquare },
          { id: 'knowledge' as TabType, label: '知識庫', icon: BookOpen },
          { id: 'config' as TabType, label: 'AI 設定', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-primary border border-b-white border-gray-200 -mb-[2px]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'chat' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Headphones className="w-5 h-5" />
                  在线客服對話
                </CardTitle>
                <CardDescription>
                  模擬客人視角測試 AI 客服回覆，對話會自動記錄到對話紀錄中
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <AICustomerChat embedded />
          </CardContent>
        </Card>
      )}
      {activeTab === 'sessions' && <SessionsPanel restaurantId={restaurantId} />}
      {activeTab === 'knowledge' && <KnowledgePanel restaurantId={restaurantId} />}
      {activeTab === 'config' && <ConfigPanel restaurantId={restaurantId} />}
    </div>
  );
}

// ========================
// 會話管理面板
// ========================
function SessionsPanel({ restaurantId }: { restaurantId: string }) {
  const { can } = usePermission();
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, ChatMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 建議功能狀態
  const [suggestingMsgId, setSuggestingMsgId] = useState<string | null>(null);
  const [suggestionText, setSuggestionText] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [suggestionSuccess, setSuggestionSuccess] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  // 刪除二次確認
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSessions(restaurantId);
      if (res.success) setSessions(res.data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleExpand = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setSuggestingMsgId(null);
      return;
    }
    setExpandedSession(sessionId);
    if (!sessionMessages[sessionId]) {
      setLoadingMessages(sessionId);
      try {
        const res = await fetchSessionMessages(sessionId);
        if (res.success) {
          setSessionMessages(prev => ({ ...prev, [sessionId]: res.data }));
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(null);
      }
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    try {
      await closeSession(sessionId);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, status: 'closed' as const } : s
      ));
    } catch (err) {
      console.error('Failed to close session:', err);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    // 第一次點擊：進入確認狀態
    if (confirmingDeleteId !== sessionId) {
      setConfirmingDeleteId(sessionId);
      // 3 秒後自動取消確認狀態
      setTimeout(() => {
        setConfirmingDeleteId(prev => prev === sessionId ? null : prev);
      }, 3000);
      return;
    }
    // 第二次點擊：執行刪除
    setConfirmingDeleteId(null);
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const filteredSessions = sessions.filter(s =>
    !searchTerm ||
    s.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 打開建議輸入框
  const openSuggestion = (msgId: string) => {
    setSuggestingMsgId(suggestingMsgId === msgId ? null : msgId);
    setSuggestionText('');
    setSuggestionSuccess(null);
    setSuggestionError(null);
  };

  // 提交建議
  const handleSubmitSuggestion = async (currentSession: AISession, msg: ChatMessage, allMessages: ChatMessage[]) => {
    if (!suggestionText.trim()) return;

    setSubmittingSuggestion(true);
    setSuggestionSuccess(null);
    setSuggestionError(null);

    try {
      // 找到當前消息的上下文：如果是 AI 回覆，找前一條用戶消息
      const msgIndex = allMessages.findIndex(m => m.id === msg.id);
      const prevUserMsg = msg.role === 'assistant' && msgIndex > 0
        ? allMessages.slice(0, msgIndex).reverse().find(m => m.role === 'user')
        : null;

      const params = {
        restaurant_id: restaurantId,
        session_id: currentSession.id,
        message_id: msg.id,
        role: msg.role,
        original_question: msg.role === 'user' ? msg.content : (prevUserMsg?.content || ''),
        original_answer: msg.role === 'assistant' ? msg.content : '',
        suggested_answer: suggestionText.trim(),
      };

      const res = await submitSuggestion(params);
      if (res.success) {
        setSuggestionSuccess('✅ 建議已提交並同步到知識庫！');
        setSuggestionText('');
        setSuggestingMsgId(null);
      } else {
        setSuggestionError(res.message || '提交失敗');
      }
    } catch (err) {
      setSuggestionError('提交失敗，請稍後再試');
    } finally {
      setSubmittingSuggestion(false);
      setTimeout(() => {
        setSuggestionSuccess(null);
        setSuggestionError(null);
      }, 3000);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              對話紀錄
            </CardTitle>
            <CardDescription>
              共 {sessions.length} 個會話 · {sessions.filter(s => s.status === 'active').length} 個活躍中
              · 點擊訊息旁的「建議」可提交修正，自動存入知識庫
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜尋客人名稱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredSessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? '沒有符合的會話' : '暫無對話記錄'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map(session => {
              const msgs = sessionMessages[session.id] || [];
              return (
                <div key={session.id} className="border rounded-lg overflow-hidden">
                  {/* Session Row */}
                  <div
                    className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleExpand(session.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        session.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {session.customer_name || '匿名客人'}
                          </span>
                          <Badge variant={session.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {session.status === 'active' ? '進行中' : '已結束'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <MessageSquare className="w-3 h-3" />
                            {session.message_count} 條
                          </span>
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(session.created_at).toLocaleDateString('zh-HK')}
                          </span>
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3" />
                            {new Date(session.updated_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {/* 對話總結 - 與日期同一行 */}
                          {session.summary && (
                            <span className="flex items-center gap-1 min-w-0 truncate max-w-[300px]">
                              <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="truncate text-gray-500">{session.summary}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {session.status === 'active' && can('ai.customer_service') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }}
                          className="text-gray-400 hover:text-red-500 h-7 w-7 p-0"
                          title="結束會話"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {can('ai.customer_service') && confirmingDeleteId === session.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">確定?</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                            className="text-red-500 hover:text-red-700 h-7 w-7 p-0 bg-red-50 hover:bg-red-100 animate-pulse"
                            title="點擊確認刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : can('ai.customer_service') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                          className="text-gray-300 hover:text-red-500 h-7 w-7 p-0"
                          title="刪除會話"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : null}
                      {expandedSession === session.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Messages */}
                  {expandedSession === session.id && (
                    <div className="border-t bg-gray-50 p-4">
                      {loadingMessages === session.id ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {msgs.length === 0 ? (
                            <p className="text-center text-gray-400 text-sm py-4">暫無訊息</p>
                          ) : (
                            msgs.map((msg, idx) => {
                              // 找前一條用戶消息作為 context
                              const pairedQuestion = msg.role === 'assistant'
                                ? msgs.slice(0, idx).reverse().find(m => m.role === 'user')?.content || ''
                                : msg.content;

                              return (
                                <div key={msg.id} className="space-y-1.5">
                                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className="group relative max-w-[80%]">
                                      {/* 消息氣泡 */}
                                      <div className={`rounded-lg px-4 py-2.5 text-sm ${
                                        msg.role === 'user'
                                          ? 'bg-amber-500 text-white rounded-tr-sm'
                                          : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
                                      }`}>
                                        <div className="flex items-center gap-1.5 mb-1">
                                          {msg.role === 'user' ? (
                                            <User className="w-3 h-3" />
                                          ) : (
                                            <Bot className="w-3 h-3" />
                                          )}
                                          <span className="text-xs opacity-70">
                                            {msg.role === 'user' ? session.customer_name || '客人' : 'AI'}
                                          </span>
                                          <span className="text-xs opacity-50">
                                            {new Date(msg.created_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </div>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                      </div>

                                      {/* 建議按鈕 - 浮在氣泡右上方，不遮擋原文 */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openSuggestion(msg.id)}
                                        className={`absolute -top-2 ${
                                          msg.role === 'user' ? '-left-10' : '-right-10'
                                        } opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 rounded-full bg-white border shadow-sm hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300`}
                                        title="對此訊息提出修正建議"
                                      >
                                        <ThumbsUp className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* 建議輸入框 - 在消息下方展開 */}
                                  {suggestingMsgId === msg.id && (
                                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} pl-10 pr-10`}>
                                      <div className="w-full max-w-[80%] bg-white border border-amber-200 rounded-lg p-3 shadow-sm">
                                        <p className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                                          <ThumbsUp className="w-3 h-3" />
                                          對此{msg.role === 'user' ? '提問' : '回覆'}提出修正建議
                                        </p>
                                        {suggestionSuccess && (
                                          <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {suggestionSuccess}
                                          </div>
                                        )}
                                        {suggestionError && (
                                          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 flex items-center gap-1">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            {suggestionError}
                                          </div>
                                        )}
                                        <Textarea
                                          placeholder={msg.role === 'assistant'
                                            ? '輸入你認為更好的AI回覆方式...'
                                            : '輸入你建議的回覆方向或補充資訊...'
                                          }
                                          value={suggestionText}
                                          onChange={(e) => setSuggestionText(e.target.value)}
                                          rows={3}
                                          className="w-full text-sm mb-2 resize-none"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setSuggestingMsgId(null); setSuggestionText(''); }}
                                            className="text-xs h-7"
                                          >
                                            取消
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => handleSubmitSuggestion(session, msg, msgs)}
                                            disabled={!suggestionText.trim() || submittingSuggestion}
                                            className="text-xs h-7 bg-amber-500 hover:bg-amber-600"
                                          >
                                            {submittingSuggestion ? (
                                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                            ) : (
                                              <Save className="w-3 h-3 mr-1" />
                                            )}
                                            提交
                                          </Button>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">
                                          提交後會自動存入知識庫，供 AI 訓練優化
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========================
// 知識庫管理面板
// ========================
function KnowledgePanel({ restaurantId }: { restaurantId: string }) {
  const { can } = usePermission();
  const [entries, setEntries] = useState<AIKnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ category: 'general', question: '', answer: '' });
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const categories = ['general', 'menu', 'hours', 'payment', 'delivery', 'promotion', 'other'];

  const categoryLabels: Record<string, string> = {
    general: '通用', menu: '菜單/產品', hours: '營業時間',
    payment: '付款方式', delivery: '外賣/送貨', promotion: '推廣優惠', other: '其他',
  };

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchKnowledgeBase(restaurantId);
      if (res.success) setEntries(res.data);
    } catch (err) {
      console.error('Failed to load knowledge base:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSave = async () => {
    if (!formData.question.trim() || !formData.answer.trim()) return;
    setSaving(true);
    try {
      await saveKnowledgeEntry({
        id: editingId || undefined,
        restaurant_id: restaurantId,
        category: formData.category,
        question: formData.question,
        answer: formData.answer,
      });
      setShowForm(false);
      setEditingId(null);
      setFormData({ category: 'general', question: '', answer: '' });
      setSuccessMsg(editingId ? '知識條目已更新' : '知識條目已新增');
      setTimeout(() => setSuccessMsg(''), 3000);
      loadEntries();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: AIKnowledgeBase) => {
    setFormData({ category: entry.category, question: entry.question, answer: entry.answer });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此知識條目？')) return;
    try {
      await deleteKnowledgeEntry(id);
      setSuccessMsg('知識條目已刪除');
      setTimeout(() => setSuccessMsg(''), 3000);
      loadEntries();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const filteredEntries = entries.filter(e =>
    !searchTerm ||
    e.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              知識庫管理
            </CardTitle>
            <CardDescription>
              管理 AI 客服的回覆知識，讓 AI 更準確地回答客人問題
            </CardDescription>
          </div>
          {can('ai.knowledge_base') && (
            <Button onClick={() => { setShowForm(true); setEditingId(null); setFormData({ category: 'general', question: '', answer: '' }); }}>
              <Plus className="w-4 h-4 mr-2" />
              新增知識
            </Button>
          )}
        </div>
        <div className="relative w-64 mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜尋知識庫..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
          </div>
        )}

        {showForm && (
          <div className="mb-6 p-4 border rounded-lg bg-gray-50 space-y-3">
            <h3 className="font-medium text-gray-900">
              {editingId ? '編輯知識條目' : '新增知識條目'}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-primary"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">常見問題</label>
              <Input
                placeholder="例如：有咩甜品推薦？"
                value={formData.question}
                onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AI 回覆</label>
              <Textarea
                placeholder="輸入 AI 應該點樣回答..."
                value={formData.answer}
                onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                rows={4}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                儲存
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {filteredEntries.map(entry => (
            <div key={entry.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {categoryLabels[entry.category] || entry.category}
                    </Badge>
                    {!entry.is_active && (
                      <Badge variant="secondary" className="text-xs">已停用</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    <span className="text-amber-500">Q:</span> {entry.question}
                  </p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    <span className="text-blue-500">A:</span> {entry.answer}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(entry.created_at).toLocaleDateString('zh-HK')}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {can('ai.knowledge_base') && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(entry)}>
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && (
            <p className="text-center py-8 text-gray-500">
              {searchTerm ? '沒有符合的知識條目' : '尚未新增任何知識條目，點擊上方按鈕新增'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ========================
// AI 配置面板
// ========================
function ConfigPanel({ restaurantId }: { restaurantId: string }) {
  const { can } = usePermission();
  const [configs, setConfigs] = useState<AIConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAIConfig(restaurantId);
      if (res.success) setConfigs(res.data);
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const configMeta: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
    system_prompt: {
      label: '系統提示詞 (System Prompt)',
      description: '定義 AI 客服的角色、語氣、回覆風格等核心設定',
      icon: <Bot className="w-5 h-5 text-purple-500" />,
    },
    business_hours: {
      label: '營業時間',
      description: '設定餐廳的營業時間，供 AI 回答時間相關問題',
      icon: <Clock className="w-5 h-5 text-blue-500" />,
    },
  };

  const handleEdit = (entry: AIConfigEntry) => {
    setEditingKey(entry.config_key);
    setEditValue(JSON.stringify(entry.config_value, null, 2));
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const handleSave = async (configKey: string) => {
    setSaving(true);
    try {
      let parsedValue;
      try {
        parsedValue = JSON.parse(editValue);
      } catch {
        alert('JSON 格式不正確，請檢查');
        setSaving(false);
        return;
      }
      await updateAIConfig(restaurantId, configKey, parsedValue);
      setEditingKey(null);
      setEditValue('');
      setSuccessMsg(`${configMeta[configKey]?.label || configKey} 已更新`);
      setTimeout(() => setSuccessMsg(''), 3000);
      loadConfig();
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          AI 客服設定
        </CardTitle>
        <CardDescription>
          設定 AI 客服的語氣、習慣、知識範圍等，讓 AI 更貼近你的餐廳風格
        </CardDescription>
      </CardHeader>
      <CardContent>
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
          </div>
        )}

        <div className="space-y-4">
          {configs.map(entry => {
            const meta = configMeta[entry.config_key];
            return (
              <div key={entry.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {meta?.icon || <Settings className="w-5 h-5 text-gray-500" />}
                    <div>
                      <h3 className="font-medium text-gray-900">{meta?.label || entry.config_key}</h3>
                      <p className="text-sm text-gray-500">{meta?.description || ''}</p>
                    </div>
                  </div>
                  {editingKey !== entry.config_key && can('ai.marketing') && (
                    <Button variant="outline" size="sm" onClick={() => handleEdit(entry)}>
                      <Settings className="w-4 h-4 mr-1" />
                      編輯
                    </Button>
                  )}
                  {editingKey !== entry.config_key && !can('ai.marketing') && (
                    <span className="text-xs text-gray-400">（唯讀）</span>
                  )}
                </div>

                {editingKey === entry.config_key ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={10}
                      className="w-full font-mono text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={handleCancelEdit}>取消</Button>
                      <Button onClick={() => handleSave(entry.config_key)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        儲存設定
                      </Button>
                    </div>
                  </div>
                ) : (
                  <pre className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 overflow-x-auto max-h-48 overflow-y-auto">
                    {JSON.stringify(entry.config_value, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}

          {configs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              尚未設定 AI 配置
            </div>
          )}

          {/* Help Tip */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">設定提示</p>
                <p><strong>system_prompt</strong> 包含以下欄位：</p>
                <ul className="list-disc list-inside space-y-1 mt-1 text-amber-700">
                  <li><code>prompt</code> - 系統角色描述</li>
                  <li><code>tone_description</code> - 語氣風格</li>
                  <li><code>personality</code> - 角色個性</li>
                  <li><code>language</code> - 使用語言</li>
                  <li><code>response_style</code> - 回覆風格</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
