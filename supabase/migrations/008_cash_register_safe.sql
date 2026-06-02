-- ========================================
-- ULTRA_POS - 收銀箱與保險箱管理
-- ========================================

-- 收銀箱日結記錄
CREATE TABLE IF NOT EXISTS cash_register (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL UNIQUE,
  opening_balance NUMERIC(10,2) DEFAULT 1500.00,     -- 底金(固定1500)
  pos_cash_income NUMERIC(10,2) DEFAULT 0,            -- POS機現金收入(自動從結算帶入)
  cash_expenses NUMERIC(10,2) DEFAULT 0,              -- 現金開支(從expenses中payment_status=cash的加總)
  expected_balance NUMERIC(10,2) DEFAULT 0,           -- 系統計算餘額 = 底金 + 現金收入 - 現金開支
  actual_counted NUMERIC(10,2),                        -- 店長實際點算
  deposited_safe NUMERIC(10,2) DEFAULT 0,              -- 存入保險箱(餘額-底金)
  difference NUMERIC(10,2) DEFAULT 0,                  -- 差異 = 實際 - 系統計算
  status TEXT CHECK (status IN ('pending', 'done')) DEFAULT 'pending',
  counted_by UUID REFERENCES employees(id),
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 保險箱入庫記錄
CREATE TABLE IF NOT EXISTS safe_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  source TEXT CHECK (source IN ('daily_settlement', 'other')) DEFAULT 'daily_settlement',
  cash_register_id UUID REFERENCES cash_register(id) ON DELETE SET NULL,
  notes TEXT,
  deposited_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 保險箱月度核對
CREATE TABLE IF NOT EXISTS safe_reconciliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- 該月1日
  expected_balance NUMERIC(10,2) DEFAULT 0,   -- 系統預計(上月結餘+本月存入)
  actual_counted NUMERIC(10,2),                -- 實際點算
  difference NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  reconciled_by UUID REFERENCES employees(id),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, month)
);

-- RLS
ALTER TABLE cash_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated to read cash_register"
  ON cash_register FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow manager+ to manage cash_register"
  ON cash_register FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')));

CREATE POLICY "Allow authenticated to read safe_deposits"
  ON safe_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow manager+ to manage safe_deposits"
  ON safe_deposits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')));

CREATE POLICY "Allow owner to read safe_reconciliation"
  ON safe_reconciliation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow owner to manage safe_reconciliation"
  ON safe_reconciliation FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role = 'owner'));

CREATE INDEX IF NOT EXISTS idx_cash_register_date ON cash_register(date);
CREATE INDEX IF NOT EXISTS idx_safe_deposits_date ON safe_deposits(date);
CREATE INDEX IF NOT EXISTS idx_safe_reconciliation_month ON safe_reconciliation(month);
