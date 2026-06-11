-- ============================================
-- 016: 修正 recipes 表 RLS 策略
-- 改用 email 關聯 auth 用戶（原錯誤使用 e.id = auth.uid()）
-- ============================================

DROP POLICY IF EXISTS "Only owner can manage recipes" ON recipes;
DROP POLICY IF EXISTS "Only owner can read recipes" ON recipes;
DROP POLICY IF EXISTS "owner_manage_recipes" ON recipes;
DROP POLICY IF EXISTS "owner_read_recipes" ON recipes;

CREATE POLICY "owner_manage_recipes" ON recipes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.email = auth.email() AND e.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.email = auth.email() AND e.role = 'owner')
  );

CREATE POLICY "owner_read_recipes" ON recipes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.email = auth.email() AND e.role = 'owner')
  );
