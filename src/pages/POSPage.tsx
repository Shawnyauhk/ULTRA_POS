import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Camera, ShoppingCart, MessageSquare, Plus, Minus, Globe, ChevronRight, X, Loader2,
  Coffee, Image as ImageIcon, Search, Edit2, Save, RefreshCw, MoreVertical, Trash2, Upload
} from 'lucide-react';
import { useProducts, useOrders } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import type { Product, Category } from '@/types';

type POSTab = 'pos' | 'products'

const DEMO_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

export function POSPage() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [activeTab, setActiveTab] = useState<POSTab>('pos');

  return (
    <div className="p-3 md:p-6 h-full flex flex-col space-y-3 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">POS 點餐系統</h1>
          <p className="text-sm text-gray-500 mt-0.5">前台點餐 · 產品管理</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 shrink-0">
        {[
          { key: 'pos' as POSTab, label: '前台點餐', icon: Coffee },
          { key: 'products' as POSTab, label: '產品管理', icon: Edit2 },
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

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'pos' && <POSTabContent lang={lang} setLang={setLang} />}
        {activeTab === 'products' && <ProductManagementTab />}
      </div>
    </div>
  )
}

// ===== POS ORDERING TAB =====
function POSTabContent({ lang, setLang }: { lang: 'zh' | 'en'; setLang: (v: 'zh' | 'en') => void }) {
  const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number; options: string[] }[]>([]);
  const [aiOrderText, setAiOrderText] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { products, categories, loading } = useProducts();

  const convertToCartProduct = (product: Product) => ({ id: product.id, name: product.name, price: product.price, emoji: '🍽️' });

  const getProductsByCategory = (categoryId: string) => products.filter(p => p.category_id === categoryId).map(convertToCartProduct);

  const localCategories = categories.map(cat => ({ id: cat.id, name: cat.name, supabaseId: cat.id }));

  const handleAddToCart = (product: any) => {
    const existing = cart.find(c => c.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...product, quantity: 1, options: ['預設'] }]);
    }
  };

  const handleAIOrder = () => {
    if (!aiOrderText.trim()) return;
    alert(`AI 正在解析您的點餐: "${aiOrderText}"...`);
    setAiOrderText('');
    setIsCartOpen(true);
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const displayedProducts = activeCategory ? getProductsByCategory(activeCategory) : [];

  return (
    <div className="flex gap-4 md:gap-6 h-full">
      <div className="flex-1 flex flex-col gap-3 md:gap-4 min-h-0">
        {/* AI Order Input */}
        <Card className="shrink-0">
          <CardContent className="p-3 md:p-4 flex gap-2 items-center">
            <MessageSquare className="w-5 h-5 text-primary shrink-0" />
            <Input
              placeholder={lang === 'zh' ? '輸入文字點餐，例如：「兩份雞蛋仔，一杯凍檸茶少甜」' : 'Type your order...'}
              value={aiOrderText}
              onChange={e => setAiOrderText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAIOrder()}
              className="flex-1"
            />
            <Button onClick={handleAIOrder} size="sm">{lang === 'zh' ? 'AI 點餐' : 'AI Order'}</Button>
            <Button variant="outline" size="icon" title="拍攝手寫單"><Camera className="w-4 h-4" /></Button>
          </CardContent>
        </Card>

        {/* Categories & Products */}
        {!activeCategory ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start overflow-y-auto">
            {localCategories.map(cat => (
              <Card key={cat.id} className="cursor-pointer hover:border-primary transition-all hover:shadow-md" onClick={() => setActiveCategory(cat.id)}>
                <CardContent className="p-6 md:p-8 flex items-center justify-between">
                  <span className="text-lg font-bold">{cat.name}</span>
                  <ChevronRight className="text-gray-400 h-5 w-5" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="mb-3 flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setActiveCategory(null)}>← {lang === 'zh' ? '返回全部分類' : 'Back'}</Button>
              <h2 className="text-lg font-bold">{localCategories.find(c => c.id === activeCategory)?.name}</h2>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 content-start pr-1">
              {displayedProducts.map(product => (
                <Card key={product.id} className="cursor-pointer hover:border-primary transition-all hover:shadow-md" onClick={() => handleAddToCart(product)}>
                  <CardContent className="p-3 md:p-4 flex flex-col items-center justify-center aspect-square text-center">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-50 rounded-full mb-2 flex items-center justify-center text-2xl md:text-3xl">{product.emoji}</div>
                    <p className="font-bold text-sm">{product.name}</p>
                    <p className="text-primary font-medium text-sm mt-0.5">${product.price}</p>
                  </CardContent>
                </Card>
              ))}
              {displayedProducts.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-400">此分類暫無產品</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cart panel */}
      <Card className={`w-72 md:w-80 lg:w-96 flex flex-col shrink-0 h-full shadow-xl border-l-4 border-l-primary ${isCartOpen ? 'block' : 'hidden md:flex'}`}>
        <CardHeader className="shrink-0 border-b pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 m-0 text-base">
            <ShoppingCart className="w-4 h-4" /> {lang === 'zh' ? '購物車' : 'Cart'}
            {totalCartItems > 0 && <Badge className="bg-red-500 text-white ml-1">{totalCartItems}</Badge>}
          </CardTitle>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsCartOpen(false)}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3 space-y-3">
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start border-b pb-3">
              <div>
                <p className="font-bold text-sm">{item.name}</p>
                <p className="text-xs text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">{item.options.join(', ')}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: Math.max(0, c.quantity - 1) } : c).filter(c => c.quantity > 0))}><Minus className="w-3 h-3" /></Button>
                  <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}><Plus className="w-3 h-3" /></Button>
                </div>
              </div>
              <p className="font-bold text-primary">${item.price * item.quantity}</p>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">{lang === 'zh' ? '購物車是空的' : 'Cart is empty'}</p>
            </div>
          )}
        </CardContent>
        <div className="p-3 border-t shrink-0 bg-gray-50 rounded-b-xl">
          <div className="flex justify-between font-bold mb-3">
            <span>{lang === 'zh' ? '總計' : 'Total'}:</span>
            <span className="text-primary">${totalAmount}</span>
          </div>
          <Button className="w-full h-11 text-base rounded-xl shadow-md" disabled={cart.length === 0} onClick={() => { alert('結帳成功！'); setCart([]); setIsCartOpen(false); }}>
            {lang === 'zh' ? '確認結帳' : 'Checkout'}
          </Button>
        </div>
      </Card>

      {/* Mobile cart toggle */}
      {!isCartOpen && (
        <Button className="fixed bottom-4 right-4 z-40 md:hidden shadow-xl rounded-full h-14 w-14" onClick={() => setIsCartOpen(true)}>
          <ShoppingCart className="h-6 w-6" />
          {totalCartItems > 0 && <Badge className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{totalCartItems}</Badge>}
        </Button>
      )}
    </div>
  );
}

// ===== PRODUCT MANAGEMENT TAB =====
function ProductManagementTab() {
  const { can } = usePermission();
  const { user } = useAuthStore();
  const { products, categories, loading, refetch } = useProducts();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '', name_en: '', category_id: '', price: 0, description: '', image_url: '', status: 'available' as Product['status'],
  });

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.name_en || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchSearch && matchCat;
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', name_en: '', category_id: categories[0]?.id || '', price: 0, description: '', image_url: '', status: 'available' });
    setShowAddModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name, name_en: product.name_en || '', category_id: product.category_id,
      price: product.price, description: product.description || '', image_url: product.image_url || '', status: product.status,
    });
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category_id) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name, name_en: formData.name_en || null, category_id: formData.category_id,
        price: formData.price, description: formData.description || null, image_url: formData.image_url || null,
        status: formData.status, restaurant_id: user?.restaurant_id || DEMO_RESTAURANT_ID,
      };
      if (editingProduct?.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
      }
      setShowAddModal(false);
      refetch();
    } catch (err) {
      console.error('Save product error:', err);
      alert('儲存產品失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此產品？')) return;
    try {
      await supabase.from('products').update({ status: 'discontinued' }).eq('id', id);
      refetch();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    const newStatus = product.status === 'available' ? 'sold_out' : 'available';
    await supabase.from('products').update({ status: newStatus }).eq('id', product.id);
    refetch();
  };

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="搜尋產品名稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={selectedCategory === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('all')}>全部分類</Button>
          {categories.map(cat => (
            <Button key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat.id)}>{cat.name}</Button>
          ))}
        </div>
        <Button size="sm" onClick={openAddModal}><Plus className="h-4 w-4 mr-1" />新增產品</Button>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredProducts.map(product => (
            <Card key={product.id} className="relative hover:shadow-md transition-shadow">
              <div className="absolute top-2 right-2 z-10">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-white/80 hover:bg-white" onClick={() => setMenuOpenId(menuOpenId === product.id ? null : product.id)}>
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
                {menuOpenId === product.id && (
                  <Card className="absolute right-0 top-8 w-32 z-20 shadow-xl">
                    <CardContent className="p-1 space-y-0.5">
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 rounded flex items-center gap-2" onClick={() => { openEditModal(product); setMenuOpenId(null); }}><Edit2 className="h-3 w-3" />編輯</button>
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 rounded flex items-center gap-2" onClick={() => { handleToggleStatus(product); setMenuOpenId(null); }}><RefreshCw className="h-3 w-3" />{product.status === 'available' ? '下架' : '上架'}</button>
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 rounded flex items-center gap-2 text-red-600" onClick={() => { handleDelete(product.id); setMenuOpenId(null); }}><Trash2 className="h-3 w-3" />刪除</button>
                    </CardContent>
                  </Card>
                )}
              </div>
              <CardContent className="p-3">
                <div className="aspect-square bg-gray-50 rounded-lg mb-2 flex items-center justify-center">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  {product.name_en && <p className="text-xs text-gray-400 truncate">{product.name_en}</p>}
                  <p className="text-primary font-bold">${product.price}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{categoryMap.get(product.category_id) || '未分類'}</Badge>
                    <Badge variant={product.status === 'available' ? 'success' : 'secondary'} className="text-[10px]">{product.status === 'available' ? '供應中' : product.status === 'sold_out' ? '售罄' : '停售'}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">暫無產品</div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle>{editingProduct ? '編輯產品' : '新增產品'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">產品名稱 *</label>
                  <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="中文名稱" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">英文名稱</label>
                  <Input value={formData.name_en} onChange={e => setFormData(f => ({ ...f, name_en: e.target.value }))} placeholder="English name" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">分類 *</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={formData.category_id} onChange={e => setFormData(f => ({ ...f, category_id: e.target.value }))}>
                  {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">價格 *</label>
                  <Input type="number" value={formData.price} onChange={e => setFormData(f => ({ ...f, price: Number(e.target.value) }))} min={0} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">狀態</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={formData.status} onChange={e => setFormData(f => ({ ...f, status: e.target.value as Product['status'] }))}>
                    <option value="available">供應中</option>
                    <option value="sold_out">售罄</option>
                    <option value="discontinued">停售</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">描述</label>
                <Input value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="產品描述（可選）" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                <Button onClick={handleSave} disabled={saving || !formData.name}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingProduct ? '儲存' : '新增'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
