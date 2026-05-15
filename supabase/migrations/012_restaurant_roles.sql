-- =========== 权限系统数据库迁移 ===========
-- 1. 为 restaurants 表添加 features JSONB 字段（功能开关）
-- 2. 创建 restaurant_roles 表（每间餐厅自定义角色权限）

-- 为 restaurants 表添加 features 字段
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN restaurants.features IS '餐厅功能开关（Feature Flags），如 {"custom_menu": true, "ai_customer_chat": true}';

-- 创建角色权限配置表
CREATE TABLE IF NOT EXISTS restaurant_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL CHECK (role_name IN ('owner', 'manager', 'staff')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, role_name)
);

-- 为所有已有餐厅插入默认权限配置
INSERT INTO restaurant_roles (restaurant_id, role_name, permissions)
SELECT
  r.id,
  role_name,
  CASE role_name
    WHEN 'owner' THEN ARRAY[
      'dashboard.view',
      'pos.create_order', 'pos.cancel_order', 'pos.refund',
      'product.view', 'product.manage',
      'inventory.view', 'inventory.manage',
      'order.view', 'order.create', 'order.approve',
      'employee.view', 'employee.manage',
      'attendance.view', 'attendance.manage',
      'schedule.view', 'schedule.manage',
      'payroll.view', 'payroll.manage',
      'expense.view', 'expense.manage',
      'report.view', 'report.export',
      'ai.marketing', 'ai.customer_service', 'ai.knowledge_base',
      'review.view', 'review.manage',
      'setting.view', 'setting.manage'
    ]
    WHEN 'manager' THEN ARRAY[
      'dashboard.view',
      'pos.create_order', 'pos.cancel_order', 'pos.refund',
      'product.view', 'product.manage',
      'inventory.view', 'inventory.manage',
      'order.view', 'order.create', 'order.approve',
      'employee.view',
      'attendance.view', 'attendance.manage',
      'schedule.view', 'schedule.manage',
      'payroll.view', 'payroll.manage',
      'expense.view', 'expense.manage',
      'report.view', 'report.export',
      'ai.marketing', 'ai.customer_service', 'ai.knowledge_base',
      'review.view', 'review.manage',
      'setting.view'
    ]
    WHEN 'staff' THEN ARRAY[
      'dashboard.view',
      'pos.create_order',
      'product.view',
      'inventory.view',
      'order.view', 'order.create',
      'attendance.view', 'attendance.manage',
      'schedule.view',
      'expense.view'
    ]
  END
FROM restaurants r
CROSS JOIN (VALUES ('owner'), ('manager'), ('staff')) AS roles(role_name)
WHERE NOT EXISTS (
  SELECT 1 FROM restaurant_roles rr
  WHERE rr.restaurant_id = r.id AND rr.role_name = roles.role_name
);

-- 添加 RLS 策略
ALTER TABLE restaurant_roles ENABLE ROW LEVEL SECURITY;

-- 当前角色权限对自身餐厅可见
CREATE POLICY "Restaurant roles are visible to own restaurant"
  ON restaurant_roles FOR ALL
  USING (restaurant_id = (SELECT (auth.jwt() ->> 'app_metadata')::jsonb ->> 'restaurant_id'::text)::uuid);
