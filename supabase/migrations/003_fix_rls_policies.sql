-- 完整的 RLS 權限修復腳本
-- 在 Supabase SQL Editor 中執行

-- 1. 先刪除可能已存在的同名策略（避免衝突）
DROP POLICY IF EXISTS "Allow authenticated users to insert order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow authenticated users to update order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow authenticated users to insert order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow authenticated users to read order_request_items" ON order_request_items;
DROP POLICY IF EXISTS "Allow anon users to insert order_requests" ON order_requests;
DROP POLICY IF EXISTS "Allow anon users to insert order_request_items" ON order_request_items;

-- 2. 允許 authenticated 用戶對 order_requests 的所有操作
CREATE POLICY "Allow authenticated users all on order_requests"
  ON order_requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. 允許 authenticated 用戶對 order_request_items 的所有操作
CREATE POLICY "Allow authenticated users all on order_request_items"
  ON order_request_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. 允許 anon 用戶（未登入/示範模式）插入 order_requests
CREATE POLICY "Allow anon insert on order_requests"
  ON order_requests FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5. 允許 anon 用戶（未登入/示範模式）插入 order_request_items
CREATE POLICY "Allow anon insert on order_request_items"
  ON order_request_items FOR INSERT
  TO anon
  WITH CHECK (true);

-- 6. 允許所有用戶讀取 order_requests
CREATE POLICY "Allow all read order_requests"
  ON order_requests FOR SELECT
  TO anon, authenticated
  USING (true);

-- 7. 允許所有用戶讀取 order_request_items
CREATE POLICY "Allow all read order_request_items"
  ON order_request_items FOR SELECT
  TO anon, authenticated
  USING (true);

-- 8. 允許 anon 用戶刪除 order_requests
CREATE POLICY "Allow anon delete on order_requests"
  ON order_requests FOR DELETE
  TO anon
  USING (true);

-- 9. 允許 anon 用戶刪除 order_request_items
CREATE POLICY "Allow anon delete on order_request_items"
  ON order_request_items FOR DELETE
  TO anon
  USING (true);

-- 10. 允許 anon 用戶更新 order_requests
CREATE POLICY "Allow anon update on order_requests"
  ON order_requests FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 11. 允許 anon 用戶更新 order_request_items
CREATE POLICY "Allow anon update on order_request_items"
  ON order_request_items FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 驗證策略已創建
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('order_requests', 'order_request_items');
