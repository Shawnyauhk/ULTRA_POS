import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Coffee, Upload, Image as ImageIcon, FileSpreadsheet, Loader2, Plus, Edit2, Save, X, Search, RefreshCw, MoreVertical, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useProducts } from '@/hooks/useSupabaseData';
import { useRealtimeProducts } from '@/hooks/useRealtime';
import type { Product, Category } from '@/types';

const DEMO_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

export function ProductsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { products, categories, loading, refetch } = useProducts();
  useRealtimeProducts(refetch);

  // 新增產品 Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);

  // AI 導入狀態
  const [aiImporting, setAiImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // =========== Excel 導入 ===========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
      const parsed = rows.map(r => ({
        restaurant_id: DEMO_RESTAURANT_ID,
        name: r['name'] ?? r['product_name'] ?? '未命名',
        price: Number(r['price'] ?? r['price_hkd'] ?? 0),
        category_id: r['category_id'] || null,
        status: 'available' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      const { error } = await supabase.from('products').upsert(parsed);
      if (error) {
        alert(`上傳失敗: ${error.message}`);
      } else {
        alert(`成功導入 ${parsed.length} 項產品！`);
        refetch();
      }
    } else if (file.type.startsWith('image/')) {
      await handleAIImport(file);
    }
    e.target.value = '';
  };

  // =========== AI 圖片導入 ===========
  const handleAIImport = async (file: File) => {
    setAiImporting(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY;
      const response = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGNES_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'agnes-2.0-flash',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              { type: 'text', text: `你是一個餐飲菜單識別助手。請分析這張圖片中的食品/飲品項目。

請以 JSON 陣列格式回覆，每個項目包含：
{
  "name": "產品名稱（繁體中文）",
  "price": 價格（數字，沒有價格則為0）,
  "category": "分類名稱（如：飲品、雞蛋仔、小食等）",
  "description": "簡短描述"
}

範例輸出：
[
  {"name": "凍檸茶", "price": 22, "category": "飲品", "description": "冰凍檸檬茶"},
  {"name": "原味雞蛋仔", "price": 28, "category": "雞蛋仔", "description": "傳統港式雞蛋仔"}
]

只回覆 JSON 陣列，不要有其他文字。` }
            ]
          }],
          max_tokens: 1024,
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);

      const data = await response.json();
      const text = data.choices?.[0]?.message?.reasoning_content ||
                   data.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('無法解析 AI 回覆');

      const aiProducts = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(aiProducts) || aiProducts.length === 0) {
        alert('AI 未能識別出任何產品，請嘗試其他圖片');
        return;
      }

      // 建立/查找分類
      const categoryMap: Record<string, string> = {};
      for (const item of aiProducts) {
        if (!item.category) continue;
        const catName = item.category;
        if (!categoryMap[catName]) {
          // 檢查分類是否已存在
          let existingCat = categories.find(c => c.name === catName);
          if (!existingCat) {
            const { data: newCat, error: catError } = await supabase
              .from('categories')
              .insert([{ restaurant_id: DEMO_RESTAURANT_ID, name: catName, sort_order: 99 }])
              .select()
              .single();
            if (!catError && newCat) {
              existingCat = newCat;
            }
          }
          if (existingCat) {
            categoryMap[catName] = existingCat.id;
          }
        }
      }

      // 批量插入產品
      const productsToInsert = aiProducts.map((item: any) => ({
        restaurant_id: DEMO_RESTAURANT_ID,
        name: item.name || '未命名',
        price: Number(item.price) || 0,
        category_id: categoryMap[item.category] || null,
        description: item.description || '',
        status: 'available' as const,
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('products')
        .insert(productsToInsert);

      if (insertError) throw insertError;

      alert(`AI 成功導入 ${productsToInsert.length} 項產品！`);
      refetch();
    } catch (err) {
      console.error('AI 導入失敗:', err);
      alert('AI 導入失敗: ' + (err as Error).message);
    } finally {
      setAiImporting(false);
    }
  };

  // =========== 新增/編輯產品 ===========
  const handleSaveProduct = async () => {
    if (!editingProduct?.name) {
      alert('請輸入產品名稱');
      return;
    }
    setSaving(true);
    try {
      const productData = {
        name: editingProduct.name,
        price: editingProduct.price || 0,
        category_id: editingProduct.category_id || null,
        description: editingProduct.description || '',
        status: (editingProduct.status || 'available') as Product['status'],
        updated_at: new Date().toISOString(),
      };

      if (editingProduct.id) {
        // 更新
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        // 新增
        const { error } = await supabase
          .from('products')
          .insert([{ ...productData, restaurant_id: DEMO_RESTAURANT_ID }]);
        if (error) throw error;
      }

      refetch();
      setShowAddModal(false);
      setEditingProduct(null);
    } catch (err) {
      alert('保存失敗: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('確定刪除此產品？')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      refetch();
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct({ ...product });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setEditingProduct({ name: '', price: 0, category_id: null, description: '', status: 'available' });
    setShowAddModal(true);
  };

  return (
    <div className="p-3 md:p-4 space-y-3 md:space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">產品管理</h1>
          <p className="text-xs md:text-base text-muted-foreground truncate md:block hidden">管理菜單產品與客製化選項</p>
        </div>
        <div className="flex flex-wrap gap-1.5 md:gap-2 flex-shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx,.xls,.csv,image/*"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" className="text-xs md:text-sm" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="text-xs md:text-sm" onClick={() => fileInputRef.current?.click()} disabled={aiImporting}>
            {aiImporting ? (
              <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
            )}
            {aiImporting ? 'AI 識別...' : 'AI 導入'}
          </Button>
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4 mr-2" /> 新增產品
          </Button>
        </div>
      </div>

      {/* 搜索與篩選 */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索產品..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 md:h-10 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <Select
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            options={[
              { value: 'all', label: '全部分類' },
              ...categories.map(c => ({ value: c.id, label: c.name }))
            ]}
            className="w-36 md:w-48"
          />
          <Button variant="ghost" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <span className="text-xs text-gray-400 whitespace-nowrap">{filteredProducts.length} 項</span>
        </div>
      </div>

      {/* 新增/編輯 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingProduct?.id ? '編輯產品' : '新增產品'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setShowAddModal(false); setEditingProduct(null); }}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">產品名稱 *</label>
                <Input value={editingProduct?.name || ''}
                  onChange={e => setEditingProduct(prev => prev ? { ...prev, name: e.target.value } : null)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">價格 (HKD)</label>
                <Input type="number" value={editingProduct?.price || ''}
                  onChange={e => setEditingProduct(prev => prev ? { ...prev, price: parseFloat(e.target.value) || 0 } : null)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">分類</label>
                <Select value={editingProduct?.category_id || ''}
                  onValueChange={v => setEditingProduct(prev => prev ? { ...prev, category_id: v } : null)}
                  options={[
                    { value: '', label: '無分類' },
                    ...categories.map(c => ({ value: c.id, label: c.name }))
                  ]} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <Input value={editingProduct?.description || ''}
                  onChange={e => setEditingProduct(prev => prev ? { ...prev, description: e.target.value } : null)} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowAddModal(false); setEditingProduct(null); }}>取消</Button>
                <Button onClick={handleSaveProduct} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 產品列表 */}
      <Card>
        <CardHeader className="px-3 py-2.5 md:px-4 md:py-3">
          <CardTitle className="text-sm md:text-base flex items-center gap-2"><Coffee className="w-4 h-4 md:w-5 md:h-5" /> 產品列表</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-2">載入中...</span>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div>
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th className="px-2 md:px-3 py-2 whitespace-nowrap text-[11px] md:text-xs">名稱</th>
                    <th className="px-2 md:px-3 py-2 whitespace-nowrap text-[11px] md:text-xs">分類</th>
                    <th className="px-2 md:px-3 py-2 whitespace-nowrap text-[11px] md:text-xs">價格</th>
                    <th className="px-2 md:px-3 py-2 whitespace-nowrap text-[11px] md:text-xs">狀態</th>
                    <th className="px-2 md:px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="px-2 md:px-3 py-2 font-medium text-sm leading-tight truncate max-w-[120px] md:max-w-[250px]" title={product.name}>{product.name}</td>
                      <td className="px-2 md:px-3 py-2 whitespace-nowrap">
                        <span className="text-[10px] md:text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">{product.category?.name || '未分類'}</span>
                      </td>
                      <td className="px-2 md:px-3 py-2 whitespace-nowrap text-sm">${product.price}</td>
                      <td className="px-2 md:px-3 py-2 whitespace-nowrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          product.status === 'available' ? 'bg-green-100 text-green-700' :
                          product.status === 'sold_out' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {product.status === 'available' ? '供應中' : product.status === 'sold_out' ? '售罄' : '已下架'}
                        </span>
                      </td>
                      <td className="px-2 md:px-3 py-2 relative">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setMenuOpenId(menuOpenId === product.id ? null : product.id)}
                        >
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </Button>
                        {menuOpenId === product.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                            <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[120px]">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                onClick={() => { setMenuOpenId(null); openEditModal(product); }}
                              >
                                <Edit2 className="w-3.5 h-3.5" /> 編輯
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                onClick={() => { setMenuOpenId(null); handleDeleteProduct(product.id); }}
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 刪除
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Coffee className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>目前沒有產品，請點擊上方按鈕導入或手動新增。</p>
              <p className="text-sm mt-2">
                支援 Excel 導入 或 使用 AI 從圖片自動識別產品
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
