import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Bot, User, RotateCcw, ExternalLink } from 'lucide-react';
import { sendAIChatMessage } from '@/lib/ai-chat';
import { FALLBACK_RESTAURANT_ID } from '@/hooks/useSupabaseData';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function AICustomerChat({ embedded = false }: { embedded?: boolean }) {
  const [customerName, setCustomerName] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (showChat && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `你好！👋 我係「小幫手」，歡迎你！有咩可以幫到你？😊
例如問我：
• 有咩甜品推介？
• 今日營業時間？
• 雞蛋仔有咩口味？`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [showChat]);

  const handleStartChat = () => {
    if (!customerName.trim()) return;
    setShowChat(true);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await sendAIChatMessage({
        message: text,
        sessionId,
        restaurantId: FALLBACK_RESTAURANT_ID,
        customerName: customerName || '客人',
        history,
      });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.reply, timestamp: new Date() },
      ]);
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '唔好意思，系統暫時繁忙，請稍後再試。或者你可以直接打俾我哋查詢！📞',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRestart = () => {
    setCustomerName('');
    setShowChat(false);
    setMessages([]);
    setInputText('');
  };

  // 未開始對話 - 姓名輸入界面
  if (!showChat) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="w-full max-w-sm text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI 客服小幫手</h2>
              <p className="text-sm text-gray-500">歡迎你！讓我幫你解答問題 😊</p>
            </div>
            <Input
              placeholder="輸入你嘅稱呼..."
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartChat()}
            />
            <Button
              onClick={handleStartChat}
              disabled={!customerName.trim()}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              開始對話
            </Button>
            <div className="flex justify-center">
              <a
                href="/ai-customer-chat"
                target="_blank"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                新視窗獨立開啟
              </a>
            </div>
            <p className="text-xs text-gray-400">Powered by AI · 回覆僅供參考</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bot className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">AI 客服小幫手</h1>
            <p className="text-orange-100 text-sm mt-1">歡迎你！讓我幫你解答問題 😊</p>
          </div>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  你嘅稱呼
                </label>
                <Input
                  placeholder="輸入你嘅名..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartChat()}
                  className="w-full"
                />
              </div>
              <Button
                onClick={handleStartChat}
                disabled={!customerName.trim()}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                開始對話
              </Button>
              <p className="text-xs text-gray-400 text-center">
                Powered by AI · 回覆僅供參考
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 對話界面
  if (embedded) {
    return (
      <div className="flex flex-col h-[600px] bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <div>
              <h2 className="text-sm font-semibold">AI 客服小幫手</h2>
              <p className="text-xs text-orange-100">{customerName}，你好！</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="/ai-customer-chat"
              target="_blank"
              className="text-white/80 hover:text-white text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10"
            >
              <ExternalLink className="w-3 h-3" />
              獨立視窗
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRestart}
              className="text-white hover:bg-white/20 h-7 w-7"
              title="重新開始"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-orange-500 border border-orange-200'
                }`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-white rounded-tr-sm'
                    : 'bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${
                    msg.role === 'user' ? 'text-amber-200' : 'text-gray-400'
                  }`}>
                    {msg.timestamp.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-2 max-w-[85%]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-white text-orange-500 border border-orange-200">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm border border-gray-100">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white p-3 shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="輸入你嘅問題..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1 rounded-full border-gray-300 focus:border-orange-400 focus:ring-orange-400 text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="rounded-full w-10 h-10 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1">
            AI 回覆僅供參考 · 如需準確資訊請直接聯絡店舖
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6" />
          <div>
            <h1 className="font-semibold">AI 客服小幫手</h1>
            <p className="text-xs text-orange-100">{customerName}，你好！</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRestart}
            className="text-white hover:bg-white/20"
            title="重新開始"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-orange-500 border border-orange-200'
              }`}>
                {msg.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-white rounded-tr-sm'
                  : 'bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-xs mt-1 ${
                  msg.role === 'user' ? 'text-amber-200' : 'text-gray-400'
                }`}>
                  {msg.timestamp.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[80%]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white text-orange-500 border border-orange-200">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Input
            placeholder="輸入你嘅問題..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 rounded-full border-gray-300 focus:border-orange-400 focus:ring-orange-400"
          />
          <Button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="rounded-full w-12 h-12 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          AI 回覆僅供參考 · 如需準確資訊請直接聯絡店舖
        </p>
      </div>
    </div>
  );
}
