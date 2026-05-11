import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Search, Upload, Check, X } from 'lucide-react'
import type { Product, Category } from '@/types'

const productCategories = [
  '格仔餅', '雞蛋仔', '小食', '豆花芋圓', '仙草芋圓', '新式糖水', '香蕉餅/蛋餅', '蒸點', '椰香西米露', '飲品'
]

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    name_en: '',
    category_id: '',
    price: 0,
    description: '',
    status: 'available' as Product['status'],
  })

  useEffect(() => {
    // Demo data
    setCategories(productCategories.map((name, i) => ({
      id: (i + 1).toString(),
      restaurant_id: 'demo',
      name,
      sort_order: i,
      created_at: new Date().toISOString(),
    })))

    const demoProducts: Product[] = [
      { id: '1', restaurant_id: 'demo', category_id: '1', name: '格仔餅（原味）', price: 18, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '2', restaurant_id: 'demo', category_id: '1', name: '格仔餅（花生醬）', price: 22, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '3', restaurant_id: 'demo', category_id: '1', name: '格仔餅（砂糖）', price: 16, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '4', restaurant_id: 'demo', category_id: '2', name: '雞蛋仔（原味）', price: 18, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '5', restaurant_id: 'demo', category_id: '2', name: '雞蛋仔（格仔餅味）', price: 20, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '6', restaurant_id: 'demo', category_id: '5', name: '仙草芋圓', price: 29, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '7', restaurant_id: 'demo', category_id: '5', name: '仙草芋圓（加雪糕）', price: 36, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '8', restaurant_id: 'demo', category_id: '9', name: '椰香西米露', price: 29, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '9', restaurant_id: 'demo', category_id: '9', name: '芒果椰香西米露', price: 40, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '10', restaurant_id: 'demo', category_id: '10', name: '鮮奶茶', price: 24, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '11', restaurant_id: 'demo', category_id: '10', name: '珍珠鮮奶茶', price: 28, status: 'available', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '12', restaurant_id: 'demo', category_id: '3', name: '炸雞脾', price: 28, status: 'sold_out', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]
    setProducts(demoProducts.map(p => ({
      ...p,
      category: categories.find(c => c.id === p.category_id)
    })))
  }, [])

  const filteredProducts = products.filter(p => {
    const catName = categories.find(c => c.id === p.category_id)?.name || ''
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === '全部' || catName === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingProduct) {
      setProducts(products.map(p => p.id === editingProduct.id ? { ...p, ...formData, updated_at: new Date().toISOString() } : p))
    } else {
      const newProduct: Product = {
        id: Date.now().toString(),
        restaurant_id: 'demo',
        ...formData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setProducts([...products, newProduct])
    }
    setShowModal(false)
    setEditingProduct(null)
    resetForm()
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      name_en: product.name_en || '',
      category_id: product.category_id,
      price: product.price,
      description: product.description || '',
      status: product.status,
    })
    setShowModal(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('確定要刪除此產品嗎？')) {
      setProducts(products.filter(p => p.id !== id))
    }
  }

  const toggleStatus = (product: Product) => {
    const newStatus = product.status === 'available' ? 'sold_out' : 'available'
    setProducts(products.map(p => p.id === product.id ? { ...p, status: newStatus, updated_at: new Date().toISOString() } : p))
  }

  const resetForm = () => {
    setFormData({ name: '', name_en: '', category_id: '1', price: 0, description: '', status: 'available' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">產品管理</h1>
          <p className="text-gray-500 mt-1">管理餐廳產品目錄</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Excel 導入
          </Button>
          <Button onClick={() => { resetForm(); setEditingProduct(null); setShowModal(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            新增產品
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="搜尋產品..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant={selectedCategory === '全部' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('全部')}>
                全部 ({products.length})
              </Button>
              {productCategories.map(cat => {
                const count = products.filter(p => categories.find(c => c.id === p.category_id)?.name === cat).length
                return (
                  <Button key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat)}>
                    {cat} ({count})
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>產品名稱</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>價格</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const cat = categories.find(c => c.id === product.category_id)
                return (
                  <TableRow key={product.id} className={product.status !== 'available' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell><Badge variant="secondary">{cat?.name || '未分類'}</Badge></TableCell>
                    <TableCell>${product.price}</TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'available' ? 'success' : 'warning'}>
                        {product.status === 'available' ? '正常' : '停售'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(product)} title={product.status === 'available' ? '停售' : '恢復'}>
                          {product.status === 'available' ? <X className="h-4 w-4 text-yellow-500" /> : <Check className="h-4 w-4 text-green-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingProduct ? '編輯產品' : '新增產品'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">產品名稱</label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div>
                  <label className="text-sm font-medium">英文名稱（選填）</label>
                  <Input value={formData.name_en} onChange={(e) => setFormData({ ...formData, name_en: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">分類</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">價格 ($)</label>
                  <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} required min={0} />
                </div>
                <div>
                  <label className="text-sm font-medium">描述（選填）</label>
                  <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>取消</Button>
                  <Button type="submit">{editingProduct ? '儲存' : '新增'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
