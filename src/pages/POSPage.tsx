import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Camera, ShoppingCart, MessageSquare, Plus, Minus, Globe, ChevronRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function POSPage() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  
  // Order State
  const [cart, setCart] = useState<{id: string, name: string, price: number, quantity: number, options: string[]}[]>([]);
  const [aiOrderText, setAiOrderText] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const CATEGORIES = [
    { id: 'snack', name: lang === 'zh' ? '小食 Snacks' : 'Snacks' },
    { id: 'drink', name: lang === 'zh' ? '飲品 Drinks' : 'Drinks' },
    { id: 'dessert', name: lang === 'zh' ? '甜品 Desserts' : 'Desserts' },
  ];

  const DUMMY_PRODUCTS = [
    { id: '1', name: lang === 'zh' ? '原味雞蛋仔' : 'Original Egg Waffle', price: 20, category: 'snack', emoji: '🥞' },
    { id: '2', name: lang === 'zh' ? '朱古力雞蛋仔' : 'Chocolate Egg Waffle', price: 25, category: 'snack', emoji: '🧇' },
    { id: '3', name: lang === 'zh' ? '凍檸茶' : 'Iced Lemon Tea', price: 18, category: 'drink', emoji: '🍹' },
    { id: '4', name: lang === 'zh' ? '珍珠奶茶' : 'Bubble Tea', price: 22, category: 'drink', emoji: '🧋' },
    { id: '5', name: lang === 'zh' ? '芒果西米露' : 'Mango Sago', price: 28, category: 'dessert', emoji: '🥭' },
  ];

  const handleAddToCart = (product: any) => {
    const existing = cart.find(c => c.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.id === product.id ? {...c, quantity: c.quantity + 1} : c));
    } else {
      setCart([...cart, { ...product, quantity: 1, options: ['預設'] }]);
    }
  };

  const handleAIOrder = () => {
    alert(`AI 正在解析您的點餐: "${aiOrderText}"...`);
    handleAddToCart(DUMMY_PRODUCTS[2]); 
    setAiOrderText('');
    setIsCartOpen(true);
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const displayedProducts = activeCategory ? DUMMY_PRODUCTS.filter(p => p.category === activeCategory) : [];

  return (
    <div className="p-6 h-[calc(100vh-2rem)] flex flex-col space-y-4 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'zh' ? 'POS 點餐系統' : 'POS Ordering'}</h1>
          <p className="text-muted-foreground">{lang === 'zh' ? '支援多模態點餐與快速客製化' : 'Multimodal Ordering & Customization'}</p>
        </div>
        <div className="flex gap-4 items-center">
          <Button variant="outline" size="icon" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            <Globe className="w-4 h-4" />
          </Button>
          <Button className="relative" variant="default" onClick={() => setIsCartOpen(!isCartOpen)}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            {lang === 'zh' ? '購物車' : 'Cart'}
            {totalCartItems > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 rounded-full w-6 h-6 flex items-center justify-center p-0">
                {totalCartItems}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        <div className="flex-1 flex flex-col gap-4 min-h-0 transition-all duration-300">
          {/* AI Multimodal Engine */}
          <Card className="shrink-0">
            <CardContent className="p-4 flex gap-2 items-center">
              <MessageSquare className="w-5 h-5 text-primary" />
              <Input 
                placeholder={lang === 'zh' ? '輸入文字或語音點餐，例如：「兩份雞蛋仔，一杯凍檸茶少甜」' : 'Type your order here...'} 
                value={aiOrderText}
                onChange={e => setAiOrderText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAIOrder()}
                className="flex-1"
              />
              <Button onClick={handleAIOrder}>{lang === 'zh' ? 'AI 點餐' : 'AI Order'}</Button>
              <Button variant="outline" size="icon" title="拍攝手寫點餐單"><Camera className="w-4 h-4" /></Button>
            </CardContent>
          </Card>

          {/* Categories and Products */}
          {!activeCategory ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {CATEGORIES.map(cat => (
                <Card key={cat.id} className="cursor-pointer hover:border-primary transition-all hover:shadow-md" onClick={() => setActiveCategory(cat.id)}>
                  <CardContent className="p-8 flex items-center justify-between">
                    <span className="text-xl font-bold">{cat.name}</span>
                    <ChevronRight className="text-gray-400" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="mb-4 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setActiveCategory(null)}>
                  {lang === 'zh' ? '← 返回全部分類' : '← Back to Categories'}
                </Button>
                <h2 className="text-xl font-bold ml-2">
                  {CATEGORIES.find(c => c.id === activeCategory)?.name}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-4 content-start pr-2">
                {displayedProducts.map(product => (
                  <Card key={product.id} className="cursor-pointer hover:border-primary transition-all hover:shadow-md" onClick={() => handleAddToCart(product)}>
                    <CardContent className="p-4 flex flex-col items-center justify-center aspect-square text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full mb-3 flex items-center justify-center text-3xl">{product.emoji}</div>
                      <p className="font-bold">{product.name}</p>
                      <p className="text-primary font-medium mt-1">${product.price}</p>
                    </CardContent>
                  </Card>
                ))}
                {displayedProducts.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-gray-400">
                    此分類暫無產品
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sliding Cart Panel */}
        {isCartOpen && (
          <Card className="w-96 flex flex-col shrink-0 h-full shadow-xl animate-in slide-in-from-right-10 border-l-4 border-l-primary z-10 absolute right-6 top-[88px] bottom-6">
            <CardHeader className="shrink-0 border-b pb-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 m-0">
                <ShoppingCart className="w-5 h-5" /> 
                {lang === 'zh' ? '購物車詳情' : 'Cart Details'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setIsCartOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start border-b pb-4">
                  <div>
                    <p className="font-bold text-lg">{item.name}</p>
                    <p className="text-sm text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">{item.options.join(', ')}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCart(cart.map(c => c.id === item.id ? {...c, quantity: Math.max(0, c.quantity - 1)} : c).filter(c => c.quantity > 0))}><Minus className="w-4 h-4"/></Button>
                      <span className="text-base font-medium w-4 text-center">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCart(cart.map(c => c.id === item.id ? {...c, quantity: c.quantity + 1} : c))}><Plus className="w-4 h-4"/></Button>
                    </div>
                  </div>
                  <p className="font-bold text-lg text-primary">${item.price * item.quantity}</p>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
                  <p>{lang === 'zh' ? '購物車是空的，請加入商品' : 'Cart is empty.'}</p>
                </div>
              )}
            </CardContent>
            <div className="p-4 border-t shrink-0 bg-gray-50 rounded-b-xl">
              <div className="flex justify-between font-bold text-xl mb-4">
                <span>{lang === 'zh' ? '總計金額' : 'Total'}:</span>
                <span className="text-primary">${totalAmount}</span>
              </div>
              <Button className="w-full h-14 text-lg rounded-xl shadow-md" disabled={cart.length === 0} onClick={() => {
                alert('結帳成功！');
                setCart([]);
                setIsCartOpen(false);
              }}>
                {lang === 'zh' ? '確認結帳 (Checkout)' : 'Checkout'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
