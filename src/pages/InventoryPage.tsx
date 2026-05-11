import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, AlertTriangle, Search, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [loading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [formData, setFormData] = useState({
    category: '糖水配料',
    name: '',
    unit: '包',
    current_stock: 0,
    min_stock_level: 10,
    supplier: '',
  })

  useEffect(() => {
    // Demo data based on warehouse Excel
    const demoInventory: Inventory[] = [
      // 糖水配料
      { id: '1', restaurant_id: 'demo', category: '糖水配料', name: '仙草粉', unit: '包', current_stock: 400, min_stock_level: 50, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '2', restaurant_id: 'demo', category: '糖水配料', name: '黑糖珍珠', unit: '包', current_stock: 66, min_stock_level: 30, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '3', restaurant_id: 'demo', category: '糖水配料', name: '西柚粒', unit: '罐', current_stock: 24, min_stock_level: 10, supplier: '供應商B', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '4', restaurant_id: 'demo', category: '糖水配料', name: '紫米', unit: '罐', current_stock: 24, min_stock_level: 10, supplier: '供應商B', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '5', restaurant_id: 'demo', category: '糖水配料', name: '椰果', unit: '包', current_stock: 30, min_stock_level: 20, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '6', restaurant_id: 'demo', category: '糖水配料', name: '黑糖粉條', unit: '包', current_stock: 5, min_stock_level: 20, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '7', restaurant_id: 'demo', category: '糖水配料', name: '黑糖粉條（筒裝）', unit: '筒', current_stock: 14, min_stock_level: 5, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '8', restaurant_id: 'demo', category: '糖水配料', name: '黑糖漿', unit: '桶', current_stock: 23, min_stock_level: 5, supplier: '供應商A', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '9', restaurant_id: 'demo', category: '糖水配料', name: '芒汁粉', unit: '包', current_stock: 45, min_stock_level: 20, supplier: '供應商B', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '10', restaurant_id: 'demo', category: '糖水配料', name: '椰子粉（河粉）', unit: '包', current_stock: 20, min_stock_level: 10, supplier: '供應商B', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '11', restaurant_id: 'demo', category: '糖水配料', name: '啫喱粉（河粉）', unit: '包', current_stock: 10, min_stock_level: 10, supplier: '供應商B', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      // 茶用品
      { id: '12', restaurant_id: 'demo', category: '茶用品', name: '飲品糖漿', unit: '桶', current_stock: 10, min_stock_level: 3, supplier: '供應商C', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '13', restaurant_id: 'demo', category: '茶用品', name: '飲管', unit: '包', current_stock: 5, min_stock_level: 10, supplier: '供應商C', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '14', restaurant_id: 'demo', category: '茶用品', name: '鴨屎香茶葉', unit: '包', current_stock: 3, min_stock_level: 5, supplier: '供應商D', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      // 碗/杯/袋/用具
      { id: '15', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '有孔大滿貫膠碗＋蓋', unit: '箱', current_stock: 7, min_stock_level: 5, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '16', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '有孔糖水膠碗＋蓋', unit: '箱', current_stock: 15, min_stock_level: 5, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '17', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '大紙碗（套餐）', unit: '箱', current_stock: 6, min_stock_level: 3, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '18', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '中紙碗', unit: '箱', current_stock: 10, min_stock_level: 3, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '19', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '奶茶樽＋密封蓋', unit: '箱', current_stock: 6, min_stock_level: 3, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '20', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '大膠袋', unit: '個', current_stock: 5000, min_stock_level: 1000, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '21', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '中膠袋', unit: '個', current_stock: 5000, min_stock_level: 1000, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '22', restaurant_id: 'demo', category: '碗/杯/袋/用具', name: '細膠袋', unit: '個', current_stock: 5000, min_stock_level: 1000, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      // 煎餅配料
      { id: '23', restaurant_id: 'demo', category: '煎餅配料', name: '咸蛋黃', unit: '包', current_stock: 5, min_stock_level: 10, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '24', restaurant_id: 'demo', category: '煎餅配料', name: '朱古力粒', unit: '包', current_stock: 24, min_stock_level: 10, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '25', restaurant_id: 'demo', category: '煎餅配料', name: '金莎醬', unit: '包', current_stock: 10, min_stock_level: 5, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '26', restaurant_id: 'demo', category: '煎餅配料', name: '芝士醬', unit: '包', current_stock: 10, min_stock_level: 5, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '27', restaurant_id: 'demo', category: '煎餅配料', name: '麻糬', unit: '包', current_stock: 21, min_stock_level: 10, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '28', restaurant_id: 'demo', category: '煎餅配料', name: '肉鬆', unit: '包', current_stock: 5, min_stock_level: 5, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      // 雜物
      { id: '29', restaurant_id: 'demo', category: '雜物', name: '一次性手套（S碼）', unit: '盒', current_stock: 10, min_stock_level: 5, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '30', restaurant_id: 'demo', category: '雜物', name: '一次性手套（M碼）', unit: '盒', current_stock: 20, min_stock_level: 5, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '31', restaurant_id: 'demo', category: '雜物', name: '短貼紙（痴盒）', unit: '個', current_stock: 20000, min_stock_level: 5000, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '32', restaurant_id: 'demo', category: '雜物', name: '長貼紙（痴糖水碗）', unit: '個', current_stock: 20000, min_stock_level: 5000, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '33', restaurant_id: 'demo', category: '雜物', name: '紙巾', unit: '包', current_stock: 36, min_stock_level: 10, supplier: '供應商E', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: '34', restaurant_id: 'demo', category: '雜物', name: '華田醬', unit: '罐', current_stock: 12, min_stock_level: 5, supplier: '供應商F', last_updated: new Date().toISOString(), created_at: new Date().toISOString() },
    ]
    setInventory(demoInventory)
    // Demo data loaded
  }, [])

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
