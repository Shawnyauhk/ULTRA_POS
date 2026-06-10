-- ========================================
-- ULTRA_POS - 秘傳配方表（絕密，僅店主可存取）
-- ========================================

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,        -- 產品名稱，如「招牌牛肉麵」
  ingredients TEXT NOT NULL DEFAULT '', -- 材料與份量
  method TEXT NOT NULL DEFAULT '',     -- 製作手法與步驟
  notes TEXT NOT NULL DEFAULT '',      -- 備註/注意事項
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- 只有店主角色可以讀取
CREATE POLICY "Only owner can read recipes"
  ON recipes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role = 'owner'
  ));

-- 只有店主角色可以新增/修改/刪除
CREATE POLICY "Only owner can manage recipes"
  ON recipes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role = 'owner'
  ));

CREATE INDEX IF NOT EXISTS idx_recipes_restaurant ON recipes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_name);
