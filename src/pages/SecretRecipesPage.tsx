import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Lock, Unlock, Plus, Pencil, Trash2, Loader2, Search, AlertCircle, Check, X, FileText, ChefHat, Info } from 'lucide-react'
import { useRecipes } from '@/hooks/useSupabaseData'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Recipe } from '@/types'

// ========================================
// 智能識別：從貼上的文字中提取配方信息
// ========================================

interface ParsedRecipe {
  product_name: string
  ingredients: string
  method: string
  notes: string
}

/** 判斷文字是否為純食材列表（無標題/章節） */
function isIngredientList(text: string): boolean {
  // 匹配「中文 + 數字」的重複模式（食材名稱後接數量的典型格式）
  // 範例：榴槤蓉200 牛奶200 煉奶60 淡忌廉30 咖奶30
  const ingredientPattern = /[\u4e00-\u9fff\w\-]+\s*[\d]+\.?[\d]*(?:g|ml|cc|oz|斤|両|包|粒|條|棵|隻|根|片|瓣|匙|杯|碗|湯匙|茶匙)?/g
  const matches = text.match(ingredientPattern)
  if (!matches) return false

  // 至少命中 2 筆才算食材列表
  if (matches.length < 2) return false

  // 檢查匹配部分是否佔了文字大部分內容（> 50%）
  const matchedLen = matches.join('').length
  const totalLen = text.replace(/\s/g, '').length
  return matchedLen / totalLen > 0.5
}

function smartParseRecipe(text: string): ParsedRecipe {
  const result: ParsedRecipe = {
    product_name: '',
    ingredients: '',
    method: '',
    notes: '',
  }

  if (!text.trim()) return result

  // 嘗試多種格式識別

  // 格式1: 有明確標題的結構化文字
  // === 招牌牛肉麵 ===
  // 材料：牛肉 500g, 麵條 200g, ...
  // 做法：1. 先煮牛肉 2. ...
  // 備註：...
  const titleMatch = text.match(/[=#*]{2,}\s*(.+?)\s*[=#*]{2,}/)
  const titleMatch2 = text.match(/^(?:產品|名稱|品名)[：:]\s*(.+)$/m)

  if (titleMatch) {
    result.product_name = titleMatch[1].trim()
  } else if (titleMatch2) {
    result.product_name = titleMatch2[1].trim()
  }

  // 材料/食材/原料 section
  const ingSection = text.match(
    /(?:材料|食材|原料|配料|成份|Ingredients)[：:]*\s*([\s\S]*?)(?=\n(?:做法|步驟|製作|方法|備註|注意|Notes|Method|$))/i
  )
  if (ingSection) {
    result.ingredients = ingSection[1].trim()
  }

  // 做法/步驟/製作 method section
  const methodSection = text.match(
    /(?:做法|步驟|製作|方法|Method|Steps|作法|流程)[：:]*\s*([\s\S]*?)(?=\n(?:備註|注意|Notes|小提醒|tips?|$))/i
  )
  if (methodSection) {
    result.method = methodSection[1].trim()
  }

  // 備註/注意 section
  const notesSection = text.match(
    /(?:備註|注意|Notes|小提醒|tips?|貼士|提醒)[：:]*\s*([\s\S]*?)$/i
  )
  if (notesSection) {
    result.notes = notesSection[1].trim()
  }

  // 如果沒有任何結構化 section 被識別，且文字看起來像食材列表
  if (!result.ingredients && !result.method && isIngredientList(text)) {
    // 拆分行，沒有被當作產品名稱的行就是食材
    const lines = text.trim().split('\n').filter(l => l.trim())
    const ingLines = lines.filter(l => {
      const trimmed = l.trim()
      // 跳過已經是產品名稱的行
      if (trimmed === result.product_name) return false
      // 跳過明顯是標題的行
      if (/^(?:產品|名稱|材料|食材|做法|步驟|備註|注意)/i.test(trimmed)) return false
      return true
    })
    result.ingredients = ingLines.join('\n')
  }

  // 如果沒有找到結構化標題，嘗試從第一行提取產品名稱
  if (!result.product_name) {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length > 0) {
      // 取第一段作為產品名稱（不含明顯的材料/做法關鍵字）
      const firstLine = lines[0].trim()
      if (!/^(?:材料|食材|做法|步驟|備註|http)/i.test(firstLine)) {
        result.product_name = firstLine.replace(/^[=#*\-]+\s*/, '').replace(/\s*[=#*\-]+$/, '').trim()
      }
    }
  }

  return result
}

// ========================================
// 模糊匹配：檢查相似產品
// ========================================

function findSimilarProducts(name: string, existing: Recipe[]): Recipe[] {
  if (!name.trim()) return []

  const search = name.toLowerCase().replace(/\s/g, '')

  return existing.filter(r => {
    const target = r.product_name.toLowerCase().replace(/\s/g, '')
    // 完全包含或包含關係
    if (target.includes(search) || search.includes(target)) return true
    // 共享至少 2 個中文字
    let commonChars = 0
    for (const ch of search) {
      if (target.includes(ch) && ch.charCodeAt(0) > 0x4e00) {
        commonChars++
      }
    }
    return commonChars >= 2
  })
}

// ========================================
// 頁面主組件
// ========================================

export function SecretRecipesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { recipes, loading, refetch, createRecipe, updateRecipe, deleteRecipe } = useRecipes()

  // === 密碼保護 ===
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  // === 頁面狀態 ===
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null)
  const [similarRecipes, setSimilarRecipes] = useState<Recipe[]>([])
  const [editMode, setEditMode] = useState<'create' | 'update'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表單
  const [form, setForm] = useState({
    product_name: '',
    ingredients: '',
    method: '',
    notes: '',
  })

  // 檢查是否有店主權限
  const isOwner = user?.role === 'owner'

  // 過濾配方
  const filteredRecipes = useMemo(() => {
    if (!searchTerm.trim()) return recipes
    const term = searchTerm.toLowerCase()
    return recipes.filter(r =>
      r.product_name.toLowerCase().includes(term) ||
      r.ingredients.toLowerCase().includes(term) ||
      r.method.toLowerCase().includes(term)
    )
  }, [recipes, searchTerm])

  // 重置表單
  const resetForm = () => {
    setForm({ product_name: '', ingredients: '', method: '', notes: '' })
    setParsedRecipe(null)
    setSimilarRecipes([])
    setEditMode('create')
    setEditingId(null)
  }

  // === 密碼解鎖 ===
  const handleUnlock = () => {
    if (password === '520520') {
      setIsUnlocked(true)
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  // === 處理貼上文字 ===
  const handlePaste = () => {
    if (!pasteText.trim()) return

    // 智能解析
    const parsed = smartParseRecipe(pasteText)
    setParsedRecipe(parsed)

    // 檢查是否已有相似產品
    const similar = findSimilarProducts(parsed.product_name, recipes)
    setSimilarRecipes(similar)

    if (similar.length > 0) {
      // 有相似產品，填充表單但讓用戶選擇
      setForm({
        product_name: parsed.product_name,
        ingredients: parsed.ingredients,
        method: parsed.method,
        notes: parsed.notes,
      })
      setEditMode('create')
      setEditingId(null)
    } else {
      // 無相似產品，直接進入新建
      setForm({
        product_name: parsed.product_name,
        ingredients: parsed.ingredients,
        method: parsed.method,
        notes: parsed.notes,
      })
      setEditMode('create')
      setEditingId(null)
    }
  }

  // === 儲存配方 ===
  const handleSave = async () => {
    if (!form.product_name.trim()) {
      setMessage({ type: 'error', text: '請填寫產品名稱' })
      return
    }
    setSaving(true)

    if (editMode === 'update' && editingId) {
      const result = await updateRecipe(editingId, form)
      if (result) {
        setMessage({ type: 'success', text: '配方已更新' })
        setShowEditor(false)
        resetForm()
      } else {
        setMessage({ type: 'error', text: '更新失敗' })
      }
    } else {
      const result = await createRecipe(form)
      if (result) {
        setMessage({ type: 'success', text: '配方已建立' })
        setShowEditor(false)
        resetForm()
      } else {
        setMessage({ type: 'error', text: '建立失敗' })
      }
    }

    setSaving(false)
    setTimeout(() => setMessage(null), 3000)
  }

  // === 編輯已有配方 ===
  const handleEdit = (recipe: Recipe) => {
    setForm({
      product_name: recipe.product_name,
      ingredients: recipe.ingredients,
      method: recipe.method,
      notes: recipe.notes,
    })
    setEditingId(recipe.id)
    setEditMode('update')
    setShowEditor(true)
    setShowPasteModal(false)
    setParsedRecipe(null)
    setSimilarRecipes([])
  }

  // === 刪除配方 ===
  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此配方？此操作不可恢復！')) return
    const ok = await deleteRecipe(id)
    if (ok) {
      setMessage({ type: 'success', text: '配方已刪除' })
      if (selectedRecipe?.id === id) setSelectedRecipe(null)
    } else {
      setMessage({ type: 'error', text: '刪除失敗' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  // 如果是非店主，直接顯示無權限
  if (!isOwner) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Lock className="w-16 h-16 text-red-300" />
            <h2 className="text-xl font-bold text-gray-700">無權限存取</h2>
            <p className="text-sm text-gray-500">此頁面僅限店主查看</p>
            <Button variant="outline" onClick={() => navigate('/')}>返回首頁</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 密碼鎖界面
  if (!isUnlocked) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
              <ChefHat className="w-10 h-10 text-amber-600" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900">秘傳配方</h2>
              <p className="text-sm text-gray-500 mt-1">請輸入密碼以進入配方管理系統</p>
            </div>
            <div className="w-full space-y-3">
              <Input
                type="password"
                placeholder="請輸入密碼"
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError(false) }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                className={`text-center text-lg ${passwordError ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-red-500 text-center">密碼錯誤，請重試</p>
              )}
              <Button className="w-full" onClick={handleUnlock} disabled={!password}>
                <Unlock className="h-4 w-4 mr-2" />解鎖進入
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-amber-600" />
            秘傳配方
          </h1>
          <p className="text-sm text-gray-500">產品配方 · 材料份量 · 製作手法</p>
        </div>
        <div className="flex items-center gap-2">
          {isUnlocked && (
            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
              <Unlock className="h-3 w-3 mr-1" />已解鎖
            </Badge>
          )}
          <Button size="sm" onClick={() => { setShowPasteModal(true); resetForm(); setPasteText('') }}>
            <FileText className="h-4 w-4 mr-1.5" />貼上識別
          </Button>
          <Button size="sm" onClick={() => { setShowEditor(true); resetForm(); setShowPasteModal(false) }}>
            <Plus className="h-4 w-4 mr-1.5" />手動新增
          </Button>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="搜尋配方（名稱、材料、做法）..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Recipe List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 space-y-2">
              {searchTerm ? '無符合搜尋的配方' : '尚無配方資料'}
              <div>
                <Button variant="outline" size="sm" onClick={() => { setShowPasteModal(true); resetForm(); setPasteText('') }}>
                  貼上文字建立配方
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredRecipes.map(recipe => (
                <div
                  key={recipe.id}
                  className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedRecipe?.id === recipe.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedRecipe(selectedRecipe?.id === recipe.id ? null : recipe)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-gray-900 truncate">{recipe.product_name}</h3>
                        <span className="text-[10px] text-gray-400">{new Date(recipe.updated_at || recipe.created_at).toLocaleDateString('zh-HK')}</span>
                      </div>
                      {recipe.ingredients && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{recipe.ingredients.slice(0, 80)}{recipe.ingredients.length > 80 ? '...' : ''}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(recipe) }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id) }}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {selectedRecipe?.id === recipe.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                      {recipe.ingredients && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">材料與份量</p>
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 leading-relaxed">{recipe.ingredients}</pre>
                        </div>
                      )}
                      {recipe.method && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">製作手法</p>
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 leading-relaxed">{recipe.method}</pre>
                        </div>
                      )}
                      {recipe.notes && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">備註</p>
                          <pre className="text-xs text-gray-500 whitespace-pre-wrap bg-gray-50 rounded p-2 leading-relaxed">{recipe.notes}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 貼上識別 Modal ===== */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowPasteModal(false); setParsedRecipe(null); setSimilarRecipes([]) }}>
          <Card className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">貼上文字 - 智能識別配方</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-gray-500">
                貼上產品配方或製作手法的文字，系統將自動識別產品名稱、材料與做法。
                {similarRecipes.length > 0 && similarRecipes.length == 0 ? '' : ''}
              </p>

              <textarea
                className="w-full h-36 font-mono text-sm p-3 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={`範例貼上格式：
=== 招牌牛肉麵 ===
材料：牛肉 500g, 麵條 200g, 蔥 2根, 薑 3片
做法：1. 先將牛肉切塊川燙
　　　2. 爆香蔥薑後加入牛肉翻炒
　　　3. 加水燉煮 1小時
備註：牛肉選用牛腱部位口感最佳`}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />

              {!parsedRecipe && (
                <Button onClick={handlePaste} disabled={!pasteText.trim()} className="w-full">
                  <FileText className="h-4 w-4 mr-2" />智能識別
                </Button>
              )}

              {/* 識別結果 */}
              {parsedRecipe && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <Check className="h-4 w-4" /> 已識別配方內容
                  </div>

                  {/* 相似產品提示 */}
                  {similarRecipes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                        <AlertCircle className="h-4 w-4" />
                        偵測到相似配方
                      </div>
                      <p className="text-xs text-amber-600">以下配方與「{parsedRecipe.product_name}」相似，是否要修改舊有配方？</p>
                      <div className="flex flex-wrap gap-2">
                        {similarRecipes.map(sr => (
                          <button
                            key={sr.id}
                            onClick={() => {
                              setForm({
                                product_name: sr.product_name,
                                ingredients: sr.ingredients,
                                method: sr.method,
                                notes: sr.notes,
                              })
                              setEditingId(sr.id)
                              setEditMode('update')
                              setShowPasteModal(false)
                              setShowEditor(true)
                            }}
                            className="text-xs bg-white border border-amber-300 rounded px-2 py-1 text-amber-700 hover:bg-amber-100"
                          >
                            {sr.product_name}
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setEditMode('create')
                          setEditingId(null)
                          setShowPasteModal(false)
                          setShowEditor(true)
                        }}
                      >
                        建立新的（不修改舊有）
                      </Button>
                    </div>
                  )}

                  {/* 識別結果預覽 */}
                  <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">產品名稱</label>
                      <p className="text-sm font-medium text-gray-900">{parsedRecipe.product_name || '（未能識別）'}</p>
                    </div>
                    {parsedRecipe.ingredients && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">材料與份量</label>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{parsedRecipe.ingredients}</pre>
                      </div>
                    )}
                    {parsedRecipe.method && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">製作手法</label>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{parsedRecipe.method}</pre>
                      </div>
                    )}
                    {parsedRecipe.notes && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">備註</label>
                        <pre className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">{parsedRecipe.notes}</pre>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      setForm({
                        product_name: parsedRecipe.product_name,
                        ingredients: parsedRecipe.ingredients,
                        method: parsedRecipe.method,
                        notes: parsedRecipe.notes,
                      })
                      setEditMode('create')
                      setEditingId(null)
                      setShowPasteModal(false)
                      setShowEditor(true)
                    }}
                    className="w-full"
                    disabled={!parsedRecipe.product_name}
                  >
                    確認無誤，建立配方
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== 配方編輯器 Modal ===== */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowEditor(false); resetForm() }}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">
                {editMode === 'update' ? '編輯配方' : '新增配方'}
                {editingId && (
                  <span className="text-xs font-normal text-gray-400 ml-2">ID: {editingId.slice(0, 8)}...</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">產品名稱 *</label>
                <Input
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="例如：招牌牛肉麵"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">材料與份量</label>
                <textarea
                  className="w-full h-28 text-sm p-3 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={form.ingredients}
                  onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))}
                  placeholder="牛肉 500g&#10;麵條 200g&#10;蔥 2根&#10;薑 3片"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">製作手法與步驟</label>
                <textarea
                  className="w-full h-36 text-sm p-3 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={form.method}
                  onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                  placeholder="1. 先將牛肉切塊川燙&#10;2. 爆香蔥薑後加入牛肉翻炒&#10;3. 加水燉煮 1小時"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">備註 / 注意事項</label>
                <textarea
                  className="w-full h-20 text-sm p-3 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="牛肉選用牛腱部位口感最佳&#10;燉煮時水位要蓋過牛肉"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => { setShowEditor(false); resetForm() }}>取消</Button>
                <Button onClick={handleSave} disabled={saving || !form.product_name.trim()}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editMode === 'update' ? '更新配方' : '建立配方'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
