-- ========================================
-- ULTRA_POS 修復缺口遷移
-- 1. 為 expenses 添加 handler 字段
-- 2. 為 inventory 添加 product_id 字段（用於自動扣庫存）
-- 3. 啟用關鍵表的 Realtime 複製
-- ========================================

-- 1. Expenses 表添加 handler 字段
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS handler TEXT DEFAULT '';

-- 2. Inventory 表添加 product_id 字段（可選關聯產品）
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- 3. 為 expenses 添加 INSERT/UPDATE RLS 策略
CREATE POLICY "Allow authenticated users to insert expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (true);

-- 4. 為 inventory 添加 UPDATE RLS 策略
CREATE POLICY "Allow authenticated users to update inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (true);

-- 5. 啟用 Realtime（這些表將廣播變更）
-- 在 Supabase Dashboard: Database > Replication 中勾選以下表：
-- products, categories, inventory, expenses, orders, order_items, settings
-- 或者執行以下 SQL：
BEGIN;
  -- 將表添加到發布
  ALTER PUBLICATION supabase_realtime ADD TABLE products;
  ALTER PUBLICATION supabase_realtime ADD TABLE categories;
  ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
  ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE settings;
EXCEPTION WHEN OTHERS THEN
  -- 如果發布不存在或表已存在，則忽略錯誤
  RAISE NOTICE '注意: 某些表可能已在 supabase_realtime 發布中';
COMMIT;

-- 6. 創建索引優化查詢
CREATE INDEX IF NOT EXISTS idx_expenses_handler ON expenses(handler);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
