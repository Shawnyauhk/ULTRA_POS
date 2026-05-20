# ULTRA_POS - 餐廳後台管理系統

適用於「家傳芋曉」糖水店的智能後台管理系統。

## 功能特色

### HR 出糧系統
- 員工資料管理（姓名、聯絡、入職日期、時薪/月薪）
- 月曆排班系統
- 打卡系統（自動計算工時）
- 薪資計算報表

### 訂貨管理系統（核心功能）
整合貨倉表，實現三階段訂貨流程：
1. **員工請求** - 查看庫存，提出訂貨需求
2. **管理員審批** - 批准/拒絕/修改訂單
3. **收貨確認** - 對比訂單與實際收貨，更新庫存

### OCR 支出記帳
- AI 智能識別收據（支援 Google Gemini、阿里雲通義千問）
- 自動提取金額、日期、商戶
- 自動分類支出項目

### 產品管理
- 產品 CRUD（新增、編輯、刪除）
- 狀態控制（停售/恢復）
- 分類管理

### AI 智能分析
- 支援多 AI 提供者（Google Gemini、阿里雲通義千問）
- 智能洞察和經營建議
- 暢銷/滯銷產品分析

### 基礎報表
- 日/月/年銷售額統計
- 分類銷售佔比
- 趨勢圖表

## 技術架構

| 項目 | 技術 |
|------|------|
| 前端框架 | React 18 + Vite + TypeScript |
| UI 組件 | Radix UI + Tailwind CSS |
| 狀態管理 | Zustand |
| 數據庫 | Supabase (PostgreSQL) |
| AI/OCR | Google Gemini Vision / 阿里雲通義千問 |
| 認證 | Supabase Auth |

## 快速開始

### 方法一：演示模式（立即體驗，無需配置）

如果只想快速體驗系統功能，可以直接啟動並使用演示模式：

```bash
npm install
npm run dev
```

訪問 http://localhost:5173，點擊「示範模式」按鈕即可體驗所有功能。

### 方法二：完整設置（推薦生產環境使用）

按照以下步驟完成完整配置：

#### 1. 安裝依賴

```bash
cd ULTRA_POS
npm install
```

#### 2. 配置環境變量

```bash
cp .env.example .env
```

編輯 `.env` 文件，填入您的 API Key：

```env
# Supabase 配置
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Google Gemini API (OCR + 分析)
VITE_GEMINI_API_KEY=your-gemini-api-key

# 阿里雲通義千問 API (OCR + 分析)
# 申請地址: https://dashscope.console.aliyun.com/
VITE_QWEN_API_KEY=your-qwen-api-key
```

#### 3. 切換 AI/OCR 提供者

只需修改對應文件頂部的配置：

**OCR (src/lib/ocr.ts)**
```typescript
const CURRENT_PROVIDER: OCRProvider = 'gemini';  // 或 'qwen'
```

**AI 分析 (src/lib/ai-analysis.ts)**
```typescript
const CURRENT_PROVIDER: AIProvider = 'gemini';  // 或 'qwen'
```

#### 4. 設置 Supabase 數據庫

詳細設置指南請查看 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)。

快速步驟：

1. 在 [Supabase](https://supabase.com) 創建新項目（或使用現有項目）
2. 訪問 SQL Editor
3. 執行 `supabase/migrations/001_initial_schema.sql`
4. 執行 `supabase/migrations/002_import_data.sql`
5. 複製項目的 URL 和 anon key 到 `.env`（已在 `.env` 中配置）

詳細文檔：
- [完整設置指南](SUPABASE_SETUP.md)
- [快速設置清單](QUICK_SETUP_CHECKLIST.md)

#### 5. 啟動開發服務器

```bash
npm run dev
```

訪問 http://localhost:5173

## AI/OCR 提供者支援

| 提供者 | OCR | AI 分析 | 申請連結 |
|--------|-----|--------|----------|
| Google Gemini | ✅ | ✅ | [申請](https://makersuite.google.com/app/apikey) |
| 阿里雲通義千問 | ✅ | ✅ | [申請](https://dashscope.console.aliyun.com/) |

### Gemini 可用模型
- OCR: `gemini-2.0-flash`
- 分析: `gemini-2.0-flash`

### 通義千問可用模型
- OCR: `qwen-vl-max`, `qwen-vl-plus`, `qwen-vl-flash`
- 分析: `qwen-plus`, `qwen-max`, `qwen-turbo`

## 預設登入

系統包含示範數據，可直接登入體驗：

| 角色 | 電郵 | 密碼 |
|------|------|------|
| 店主 | owner@demo.com | demo123 |
| 主管 | manager@demo.com | demo123 |
| 員工 | staff@demo.com | demo123 |

## 功能頁面

- `/` - 登入頁
- `/dashboard` - 儀表板
- `/employees` - 員工管理
- `/schedules` - 排班管理
- `/attendance` - 打卡記錄
- `/inventory` - 倉庫存貨
- `/orders` - 訂貨管理
- `/products` - 產品管理
- `/expenses` - 支出記帳
- `/reports` - 數據報表
- `/ai-chat` - AI 客服

## 未來功能（按需開發）

- [ ] 顧客端掃碼點餐
- [ ] Stripe 支付整合
- [ ] 庫存自動補充建議
- [ ] 供應商管理
- [ ] 多語言支援

## 成本估算

| 服務 | 方案 | 月費 |
|------|------|------|
| Supabase | Free Tier | $0 |
| Google Gemini | 按量計費 | ~$5-20 |
| 通義千問 | 按量計費 | ~$5-15 |
| Cloudflare Pages | 免費版 | $0 |
| **合計** | | **$5-20/月** |

## 項目結構

```
ULTRA_POS/
├── public/
├── src/
│   ├── components/
│   │   ├── ui/          # UI 組件
│   │   └── layout/      # 佈局組件
│   ├── pages/           # 頁面組件
│   ├── lib/             # 工具函數
│   │   ├── supabase.ts  # Supabase 客戶端
│   │   ├── ocr.ts       # OCR 服務（支援多提供者）
│   │   └── ai-analysis.ts # AI 分析服務（支援多提供者）
│   ├── stores/          # Zustand stores
│   └── types/            # TypeScript 類型
├── supabase/
│   └── migrations/       # 數據庫遷移腳本
├── package.json
└── vite.config.ts
```

## 許可

MIT License
