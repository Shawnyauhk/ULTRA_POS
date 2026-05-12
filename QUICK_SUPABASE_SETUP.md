# ULTRA_POS Supabase 快速设置指南

## 🚀 新的 Supabase 项目已配置

您的项目现在连接到新的 Supabase 实例：

- **项目 URL**: https://mTjJdfGLnbaeQBqWrSqJkg.supabase.co
- **发布密钥**: sb_publishable_mTjJdfGLnbaeQBqWrSqJkg__MyKYlVS
- **服务角色密钥**: sb_secret_IdwuxwOAbbhaWhYSQR3IBw_9F7YhNCz

## ⚡ 快速开始

### 步骤 1：在 Supabase 中创建数据库表

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目 `mTjJdfGLnbaeQBqWrSqJkg.supabase.co`
3. 点击左侧菜单 **SQL Editor**
4. 按顺序执行以下迁移文件：

#### 执行顺序：

1. **001_initial_schema.sql** - 创建基础表结构
   - restaurants, employees, schedules, attendance
   - categories, products, inventory
   - order_requests, order_request_items, goods_receipt
   - expenses, chat_messages
   - 包含 RLS 策略和索引
   - 包含演示数据

2. **002_import_data.sql** - 导入产品数据
   - 11 个产品分类
   - 94 项完整产品列表

3. **003_additional_tables.sql** - 创建额外表（可选但推荐）
   - orders（POS 订单）
   - order_items（订单明细）
   - settings（系统设置）
   - reviews（AI 好评）
   - reports（AI 报告）

### 步骤 2：测试连接

在项目根目录运行：

```bash
npx tsx test-supabase-connection.ts
```

### 步骤 3：启动应用

```bash
npm run dev
```

## 📁 相关文件

| 文件 | 描述 |
|------|------|
| `.env` | Supabase 凭据配置 |
| `src/lib/supabase.ts` | Supabase 客户端初始化 |
| `src/lib/supabaseHelpers.ts` | 数据操作辅助函数 |
| `supabase/migrations/*.sql` | 数据库迁移脚本 |
| `test-supabase-connection.ts` | 连接测试脚本 |

## 🔧 如需重置数据库

如果需要重新开始：

1. 在 Supabase Dashboard 中，转到 **SQL Editor**
2. 执行以下命令清空所有数据：

```sql
-- 禁用外键检查
SET CONSTRAINTS ALL DEFERRED;

-- 清空所有表
TRUNCATE TABLE 
  order_items, orders, reviews, reports, settings,
  order_request_items, order_requests, goods_receipt, expenses,
  chat_messages, inventory, products, categories,
  schedules, attendance, employees, restaurants
CASCADE;

-- 重新启用外键检查
RESET CONSTRAINTS ALL;
```

3. 重新运行迁移脚本

## ❓ 故障排除

### 问题：表不存在
**解决方案**：运行所有迁移脚本

### 问题：权限被拒绝
**解决方案**：在 SQL Editor 中先执行 `SET ROLE postgres;`

### 问题：CORS 错误
**解决方案**：在 Supabase **Settings > API** 中检查 CORS 配置

## 📞 获取帮助

- Supabase 文档: https://supabase.com/docs
- 项目问题排查: 参考 `SUPABASE_SETUP.md`
