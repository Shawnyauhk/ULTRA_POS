# Supabase 数据库快速设置清单

## ✅ 已完成

- [x] 创建 Supabase 项目
- [x] 配置 `.env` 文件
- [x] 编写数据库架构 (001_initial_schema.sql)
- [x] 编写产品数据导入 (002_import_data.sql)
- [x] 配置 Supabase 客户端
- [x] 集成 Supabase Auth
- [x] 创建设置指南

## 📋 待执行（需要在 Supabase Dashboard 操作）

- [ ] 在 SQL Editor 中运行 `001_initial_schema.sql`
- [ ] 在 SQL Editor 中运行 `002_import_data.sql`
- [ ] 验证数据库表和数据

## 🧪 测试步骤

1. 启动开发服务器：`npm run dev`
2. 访问 http://localhost:5173
3. 点击「示範模式」登录
4. 验证以下功能：
   - [ ] 仪表板显示数据
   - [ ] 员工管理页面
   - [ ] 产品管理页面
   - [ ] 库存管理页面
   - [ ] 订货管理页面

## 🔗 重要链接

- **Supabase Dashboard**: https://supabase.com/dashboard
- **项目地址**: https://amiceplfaeofaofoveun.supabase.co
- **本地开发**: http://localhost:5173

## 📝 数据库表清单

| 表名 | 用途 | 状态 |
|------|------|------|
| restaurants | 餐厅信息 | 待创建 |
| employees | 员工管理 | 待创建 |
| schedules | 排班表 | 待创建 |
| attendance | 打卡记录 | 待创建 |
| categories | 产品分类 | 待创建 |
| products | 产品列表 | 待创建 |
| inventory | 库存管理 | 待创建 |
| order_requests | 订货请求 | 待创建 |
| order_request_items | 订货明细 | 待创建 |
| goods_receipt | 收货记录 | 待创建 |
| expenses | 支出记录 | 待创建 |
| chat_messages | AI对话记录 | 待创建 |

## 🚀 快速开始

如果这是第一次设置 Supabase：

1. 打开 SUPABASE_SETUP.md 完整指南
2. 按步骤在 Supabase SQL Editor 执行 SQL
3. 启动应用并测试
