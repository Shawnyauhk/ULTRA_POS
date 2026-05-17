-- 每日營業額結算表（對應 POSPAL 「门店销售汇总」欄位）
CREATE TABLE IF NOT EXISTS daily_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  settlement_date DATE NOT NULL,
  store_name TEXT,
  
  -- POSPAL 門店銷售匯總欄位
  cash NUMERIC(12,2) DEFAULT 0,             -- 現金支付
  unionpay NUMERIC(12,2) DEFAULT 0,         -- 銀聯支付
  stored_value NUMERIC(12,2) DEFAULT 0,     -- 儲值卡支付
  octopus NUMERIC(12,2) DEFAULT 0,          -- 八達通
  foodpanda NUMERIC(12,2) DEFAULT 0,        -- Foodpanda
  alipay_hk NUMERIC(12,2) DEFAULT 0,        -- 支付寶香港
  wechat_hk NUMERIC(12,2) DEFAULT 0,        -- WeChat 香港
  meituan_keeta NUMERIC(12,2) DEFAULT 0,    -- 美團 KEETA
  openrice NUMERIC(12,2) DEFAULT 0,         -- Openrice
  
  -- 其他支付方式（預留）
  booking_deposit NUMERIC(12,2) DEFAULT 0,  -- 預定金支付
  visit_card NUMERIC(12,2) DEFAULT 0,       -- 次卡支付
  shopping_card NUMERIC(12,2) DEFAULT 0,    -- 購物卡支付
  prepaid_card NUMERIC(12,2) DEFAULT 0,     -- 預付卡支付
  
  -- 總計欄位
  total_amount NUMERIC(12,2) DEFAULT 0,     -- 總金額
  actual_revenue NUMERIC(12,2) DEFAULT 0,   -- 營業實收
  total_transactions INTEGER DEFAULT 0,     -- 總筆數
  
  -- 元數據
  raw_json JSONB,                            -- POSPAL 原始數據
  source TEXT DEFAULT 'manual',              -- 數據來源: manual / pospal_crawler
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 每天每間餐廳只有一筆記錄
  UNIQUE(restaurant_id, settlement_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_daily_settlements_date ON daily_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_daily_settlements_restaurant ON daily_settlements(restaurant_id);

-- RLS 策略
ALTER TABLE daily_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon all on daily_settlements"
  ON daily_settlements FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
