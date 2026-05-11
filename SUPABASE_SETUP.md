# ULTRA_POS Supabase 数据库设置指南

本指南将帮助您完成 Supabase 数据库的设置，实现真实数据持久化。

## 前置条件

- 已有的 Supabase 项目：https://amiceplfaeofaofoveun.supabase.co
- 已在本地配置 `.env` 文件（已在项目中配置）

## 步骤 1：访问 Supabase SQL Editor

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择您的项目 `amiceplfaeofaofoveun.supabase.co`
3. 在左侧菜单点击 **SQL Editor**
4. 点击 **New Query** 创建新查询

## 步骤 2：运行数据库迁移

在 SQL Editor 中按顺序执行以下两个文件的内容：

### 2.1 执行初始架构迁移

复制 `supabase/migrations/001_initial_schema.sql` 的全部内容，粘贴到 SQL Editor 并点击 **Run**。

此脚本将创建：
- ✅ 所有数据表（restaurants, employees, schedules, attendance, categories, products, inventory, order_requests, order_request_items, goods_receipt, expenses, chat_messages）
- ✅ Row Level Security (RLS) 策略
- ✅ 索引优化
- ✅ 演示数据（1个餐厅、4名员工、20项库存）

### 2.2 执行产品数据导入

复制 `supabase/migrations/002_import_data.sql` 的全部内容，粘贴到 SQL Editor 并点击 **Run**。

此脚本将导入：
- ✅ 11个产品分类
- ✅ 94项完整产品列表（包含价格）
- ✅ 详细的验证查询

## 步骤 3：验证设置

执行以下查询验证数据库设置：

```sql
-- 检查所有表
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 检查演示数据
SELECT '餐廳' as 類型, COUNT(*) as 數量 FROM restaurants
UNION ALL
SELECT '員工', COUNT(*) FROM employees
UNION ALL
SELECT '產品', COUNT(*) FROM products
UNION ALL
SELECT '庫存', COUNT(*) FROM inventory;

-- 按分類統計產品
SELECT c.name as 分類, COUNT(p.id) as 產品數
FROM categories c
LEFT JOIN products p ON c.id = p.category_id
GROUP BY c.name, c.sort_order
ORDER BY c.sort_order;
```

## 步骤 4：配置身份认证（可选）

如果需要启用真实的用户登录功能：

### 4.1 启用 Email 登录

1. 在 Supabase Dashboard 中，转到 **Authentication** > **Settings**
2. 确保 **Email** 提供商已启用
3. 配置 **Site URL**: `http://localhost:5173`
4. 配置 **Redirect URLs**: `http://localhost:5173/*`

### 4.2 创建测试用户

在 SQL Editor 中执行：

```sql
-- 在 auth.users 中创建用户（需要 Supabase Admin API）
-- 或通过应用程序的注册功能创建
```

### 4.3 关联员工记录

如果使用真实认证，需要将 `auth.users` 与 `employees` 表关联：

```sql
-- 添加 auth_id 字段
ALTER TABLE employees ADD COLUMN auth_id UUID REFERENCES auth.users(id);

-- 更新演示员工的 auth_id（如果有）
UPDATE employees SET auth_id = 'your-auth-user-id' WHERE email = 'demo@demo.com';
```

## 步骤 5：配置行级安全策略（RLS）

当前 RLS 策略设置为允许所有认证用户读取数据。如需更严格的控制，可以修改策略：

### 5.1 基于餐厅的访问控制

```sql
-- 示例：只允许访问自己餐厅的数据
CREATE POLICY "Users can only access their restaurant data"
ON employees FOR ALL
TO authenticated
USING (
  restaurant_id IN (
    SELECT restaurant_id FROM employees WHERE auth_id = auth.uid()
  )
);
```

### 5.2 角色基础的访问控制

```sql
-- 示例：只有 owner 和 manager 可以修改员工数据
CREATE POLICY "Only owners and managers can update employees"
ON employees FOR UPDATE
TO authenticated
USING (
  role IN ('owner', 'manager')
);
```

## 步骤 6：启动应用程序

数据库设置完成后，启动开发服务器：

```bash
npm run dev
```

访问 http://localhost:5173，您将看到登录页面。

### 6.1 演示模式登录

点击 **「示範模式（無需設定）」** 按钮可以使用演示数据预览系统功能（无需设置 Supabase）。

### 6.2 真实登录

使用在 Supabase Authentication 中创建的用户账号登录，数据将被持久化到真实的 Supabase 数据库。

## 故障排除

### 问题 1：SQL 执行失败

**错误**: `permission denied for schema public`

**解决方案**: 确保您使用的是项目所有者账户，或在 SQL Editor 中执行 `SET ROLE postgres;`

### 问题 2：CORS 错误

**错误**: `Access to fetch at 'https://xxx.supabase.co' from origin 'http://localhost:5173' has been blocked by CORS policy`

**解决方案**: 
1. 在 Supabase Dashboard 中，转到 **Settings** > **API**
2. 检查 **CORS** 配置，确保 `http://localhost:5173` 在允许的 origin 列表中

### 问题 3：RLS 导致数据无法访问

**错误**: `permission denied for table xxx`

**解决方案**: 
1. 检查 RLS 策略
2. 使用 `SELECT * FROM xxx LIMIT 1;` 测试
3. 如需临时禁用：`ALTER TABLE xxx DISABLE ROW LEVEL SECURITY;`

## 下一步

数据库设置完成后，您可以：

1. ✅ 员工打卡和考勤管理
2. ✅ 产品和分类管理
3. ✅ 库存监控和订货管理
4. ✅ 支出记录和 OCR 识别
5. ✅ AI 客服系统

如需查看数据库架构的详细说明，请参考 `plan.md` 文件。

## 技术支持

如遇到问题，请检查：
1. Supabase Dashboard 的 [Logs Explorer](https://supabase.com/dashboard/project/_/logs)
2. 浏览器控制台的错误信息
3. `.env` 文件中的环境变量配置

---

**创建时间**: 2026-05-10
**最后更新**: 2026-05-10
