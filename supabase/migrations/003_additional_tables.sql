-- ========================================
-- ULTRA_POS 額外表結構
-- Orders, Settings, Reviews, Reports
-- ========================================

-- Orders table (POS orders)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  final_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'octopus', 'alipay', 'wechat', 'visa')),
  order_type TEXT CHECK (order_type IN ('dine_in', 'takeout', 'delivery')) DEFAULT 'dine_in',
  status TEXT CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled', 'refunded')) DEFAULT 'pending',
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  options TEXT[], -- Array of selected options
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT CHECK (setting_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table (AI generated positive reviews)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  review_type TEXT CHECK (review_type IN ('auto_generated', 'manual', 'customer')) DEFAULT 'auto_generated',
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  platform TEXT CHECK (platform IN ('google', 'facebook', 'openrice', 'tripadvisor', 'internal')),
  status TEXT CHECK (status IN ('draft', 'posted', 'rejected')) DEFAULT 'draft',
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reports table (AI generated reports)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  report_type TEXT CHECK (report_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'custom')) NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  period_start DATE,
  period_end DATE,
  generated_by TEXT, -- AI model used
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for new tables
CREATE POLICY "Allow authenticated users to read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read order_items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert order_items"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage settings"
  ON settings FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert reviews"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read reports"
  ON reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_settings_key ON settings(setting_key);
CREATE INDEX idx_reviews_order ON reviews(order_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_created_at ON reports(created_at);

-- Insert default settings
INSERT INTO settings (restaurant_id, setting_key, setting_value, setting_type, description) VALUES
('00000000-0000-0000-0000-000000000001', 'restaurant_name', '家傳芋曉', 'string', '餐廳名稱'),
('00000000-0000-0000-0000-000000000001', 'business_hours', '11:00 - 22:00', 'string', '營業時間'),
('00000000-0000-0000-0000-000000000001', 'tax_rate', '0', 'number', '稅率百分比'),
('00000000-0000-0000-0000-000000000001', 'service_charge', '0', 'number', '服務費百分比'),
('00000000-0000-0000-0000-000000000001', 'auto_generate_review', 'true', 'boolean', '自動生成好評'),
('00000000-0000-0000-0000-000000000001', 'ai_review_count', '3', 'number', '每次生成好評數量'),
('00000000-0000-0000-0000-000000000001', 'low_stock_threshold', '10', 'number', '庫存警告阈值')
ON CONFLICT DO NOTHING;
