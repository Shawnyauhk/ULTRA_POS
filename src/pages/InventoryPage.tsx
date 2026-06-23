import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, AlertTriangle, Search, ShoppingCart, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '@/hooks/useSupabaseData'
import type { Inventory } from '@/types'

// Warehouse categories from the Excel file
const warehouseCategories = [
  '糖水配料',
  '茶用品',
  '碗/杯/袋/用具',
  '煎餅配料',
  '雜物',
  '雞蛋仔/格餅配料',
]

export function InventoryPage() {
  const navigate = useNavigate()
  const { inventory, loading, refetch, updateInventory, addInventory } = useInventory()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    category: '糖水配料',
    name: '',
    unit: '包',
    current_stock: 0,
    min_stock_level: 10,
    supplier: '',
  })

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const lowStockItems = inventory.filter(item => item.current_stock < item.min_stock_level)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingItem) {
      setInventory(inventory.map(item =>
        item.id === editingItem.id ? { ...item, ...formData, last_updated: new Date().toISOString() } : item
      ))
    } else {
      const newItem: Inventory = {
        id: Date.now().toString(),
        restaurant_id: 'demo',
        ...formData,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      setInventory([...inventory, newItem])
    }
    setShowModal(false)
    setEditingItem(null)
    resetForm()
  }

  const handleEdit = (item: Inventory) => {
    setEditingItem(item)
    setFormData({
      category: item.category,
      name: item.name,
      unit: item.unit,
      current_stock: item.current_stock,
      min_stock_level: item.min_stock_level,
      supplier: item.supplier || '',
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      category: '糖水配料',
      name: '',
      unit: '包',
      current_stock: 0,
      min_stock_level: 10,
      supplier: '',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">倉庫存貨</h1>
          <p className="text-gray-500 mt-1">管理倉庫貨物庫存</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/orders')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            訂貨管理
          </Button>
          <Button onClick={() => { resetForm(); setEditingItem(null); setShowModal(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            新增貨物
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">庫存預警：{lowStockItems.length} 項貨物低於最低庫存</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {lowStockItems.slice(0, 5).map((item) => (
                <Badge key={item.id} variant="warning" className="cursor-pointer" onClick={() => handleEdit(item)}>
                  {item.name} (現有 {item.current_stock}{item.unit})
                </Badge>
              ))}
              {lowStockItems.length > 5 && (
                <Badge variant="secondary">+{lowStockItems.length - 5} 更多</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜尋貨物名稱..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === '全部' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('全部')}
              >
                全部 ({inventory.length})
              </Button>
              {warehouseCategories.map((cat) => {
                const count = inventory.filter(i => i.category === cat).length
                return (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat} ({count})
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>貨物名稱</TableHead>
                <TableHead>類別</TableHead>
                <TableHead>現有庫存</TableHead>
                <TableHead>最低庫存</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>供應商</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => {
                const isLow = item.current_stock < item.min_stock_level
                return (
                  <TableRow key={item.id} className={isLow ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={isLow ? 'text-yellow-600 font-medium' : ''}>
                        {item.current_stock} {item.unit}
                      </span>
                    </TableCell>
                    <TableCell>{item.min_stock_level} {item.unit}</TableCell>
                    <TableCell>
                      {isLow ? (
                        <Badge variant="warning" className="flex items-center gap-1 w-fit">
                          <AlertTriangle className="h-3 w-3" />
                          庫存不足
                        </Badge>
                      ) : (
                        <Badge variant="success">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">{item.supplier || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingItem ? '編輯貨物' : '新增貨物'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">類別</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {warehouseCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">貨物名稱</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">現有庫存</label>
                    <Input
                      type="number"
                      value={formData.current_stock}
                      onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">單位</label>
                    <Input
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">最低庫存</label>
                    <Input
                      type="number"
                      value={formData.min_stock_level}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">供應商</label>
                    <Input
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                    取消
                  </Button>
                  <Button type="submit">{editingItem ? '儲存' : '新增'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
