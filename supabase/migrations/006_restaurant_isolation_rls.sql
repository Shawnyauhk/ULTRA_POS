-- ============================================
-- 006: 餐廳租戶隔離 RLS 策略
-- ============================================
-- 用途：確保每個餐廳只能看到自己的數據
-- 原理：查詢 employees.email → auth.email() 的對應關係
-- ============================================

-- 輔助函數：取得當前用戶所屬的餐廳 ID
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT restaurant_id FROM public.employees
  WHERE email = auth.email()
  LIMIT 1;
$$;

-- =====================
-- restaurants
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users to read restaurants" ON restaurants;
CREATE POLICY "restaurant_isolation_select" ON restaurants
  FOR SELECT TO authenticated
  USING (id = get_user_restaurant_id());

-- =====================
-- employees
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users to read employees" ON employees;
CREATE POLICY "restaurant_isolation_select" ON employees
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

-- 員工新增只允許自己餐廳
CREATE POLICY "restaurant_isolation_insert" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_update" ON employees
  FOR UPDATE TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- schedules / attendance（透過 employee 關聯至餐廳）
-- =====================
CREATE POLICY "restaurant_isolation_select" ON schedules
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  );

CREATE POLICY "restaurant_isolation_select" ON attendance
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  );

-- =====================
-- categories
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON categories;
CREATE POLICY "restaurant_isolation_select" ON categories
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_all" ON categories
  FOR ALL TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- products
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users to read products" ON products;
CREATE POLICY "restaurant_isolation_select" ON products
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_all" ON products
  FOR ALL TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- inventory
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users to read inventory" ON inventory;
CREATE POLICY "restaurant_isolation_select" ON inventory
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_all" ON inventory
  FOR ALL TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- order_requests（先清空舊政策）
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users all on order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow authenticated users to insert order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow authenticated users to update order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow all read order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow anon insert on order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow anon delete on order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow anon update on order_requests" ON order_requests;

CREATE POLICY "restaurant_isolation_select" ON order_requests
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_insert" ON order_requests
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_update" ON order_requests
  FOR UPDATE TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_delete" ON order_requests
  FOR DELETE TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

-- =====================
-- order_request_items（清空舊政策）
-- =====================
DROP POLICY IF EXISTS "Allow authenticated users all on order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow authenticated users to insert order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow authenticated users to read order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow all read order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow anon insert on order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow anon delete on order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow anon update on order_request_items" ON order_request_items;

-- order_request_items 透過 order_requests 關聯至餐廳
CREATE POLICY "restaurant_isolation_select" ON order_request_items
  FOR SELECT TO authenticated
  USING (
    order_request_id IN (
      SELECT id FROM order_requests WHERE restaurant_id = get_user_restaurant_id()
    )
  );

CREATE POLICY "restaurant_isolation_insert" ON order_request_items
  FOR INSERT TO authenticated
  WITH CHECK (
    order_request_id IN (
      SELECT id FROM order_requests WHERE restaurant_id = get_user_restaurant_id()
    )
  );

CREATE POLICY "restaurant_isolation_update" ON order_request_items
  FOR UPDATE TO authenticated
  USING (
    order_request_id IN (
      SELECT id FROM order_requests WHERE restaurant_id = get_user_restaurant_id()
    )
  );

CREATE POLICY "restaurant_isolation_delete" ON order_request_items
  FOR DELETE TO authenticated
  USING (
    order_request_id IN (
      SELECT id FROM order_requests WHERE restaurant_id = get_user_restaurant_id()
    )
  );

-- =====================
-- goods_receipt
-- =====================
CREATE POLICY "restaurant_isolation_select" ON goods_receipt
  FOR SELECT TO authenticated
  USING (
    order_request_id IN (
      SELECT id FROM order_requests WHERE restaurant_id = get_user_restaurant_id()
    )
  );

-- =====================
-- expenses
-- =====================
CREATE POLICY "restaurant_isolation_select" ON expenses
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_insert" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_update" ON expenses
  FOR UPDATE TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_delete" ON expenses
  FOR DELETE TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

-- =====================
-- settings
-- =====================
CREATE POLICY "restaurant_isolation_select" ON settings
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_insert" ON settings
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_update" ON settings
  FOR UPDATE TO authenticated
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- reviews
-- =====================
CREATE POLICY "restaurant_isolation_select" ON reviews
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "restaurant_isolation_insert" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_user_restaurant_id());

-- =====================
-- 驗證所有策略
-- =====================
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
