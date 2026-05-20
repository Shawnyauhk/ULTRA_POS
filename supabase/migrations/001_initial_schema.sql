-- ULTRA_POS Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  business_hours TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE,
  role TEXT CHECK (role IN ('owner', 'manager', 'staff')) DEFAULT 'staff',
  hourly_rate NUMERIC(10,2),
  monthly_salary NUMERIC(10,2),
  hire_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedules table
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  work_hours NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  price NUMERIC(10,2) NOT NULL,
  description TEXT,
  image_url TEXT,
  status TEXT CHECK (status IN ('available', 'sold_out', 'discontinued')) DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory table (warehouse stock)
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_stock NUMERIC(10,2) DEFAULT 0,
  min_stock_level NUMERIC(10,2) DEFAULT 0,
  supplier TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order requests table
CREATE TABLE order_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES employees(id),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'partial', 'received')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order request items table
CREATE TABLE order_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_request_id UUID REFERENCES order_requests(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  requested_quantity NUMERIC(10,2) NOT NULL,
  approved_quantity NUMERIC(10,2),
  received_quantity NUMERIC(10,2),
  unit_price NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goods receipt table
CREATE TABLE goods_receipt (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_request_id UUID REFERENCES order_requests(id) ON DELETE CASCADE,
  received_by UUID REFERENCES employees(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Expenses table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('food', 'rent', 'utilities', 'salary', 'supplies', 'other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table (AI chatbot)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies (example - allow authenticated users to read their restaurant data)
CREATE POLICY "Allow authenticated users to read restaurants"
  ON restaurants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX idx_employees_restaurant ON employees(restaurant_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_order_requests_status ON order_requests(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- Insert demo restaurant
INSERT INTO restaurants (id, name, business_hours) 
VALUES ('00000000-0000-0000-0000-000000000001', '家傳芋曉', '11:00 - 22:00');

-- Insert demo categories (11 categories)
INSERT INTO categories (restaurant_id, name, sort_order) VALUES
('00000000-0000-0000-0000-000000000001', '鎖匙扣', 1),
('00000000-0000-0000-0000-000000000001', '格仔餅', 2),
('00000000-0000-0000-0000-000000000001', '雞蛋仔', 3),
('00000000-0000-0000-0000-000000000001', '小食', 4),
('00000000-0000-0000-0000-000000000001', '豆花芋圓', 5),
('00000000-0000-0000-0000-000000000001', '仙草芋圓', 6),
('00000000-0000-0000-0000-000000000001', '新式糖水', 7),
('00000000-0000-0000-0000-000000000001', '香蕉餅/蛋餅', 8),
('00000000-0000-0000-0000-000000000001', '蒸點', 9),
('00000000-0000-0000-0000-000000000001', '椰香西米露', 10),
('00000000-0000-0000-0000-000000000001', '飲品', 11);

-- Insert demo employees
INSERT INTO employees (restaurant_id, name, phone, email, role, hourly_rate, hire_date) VALUES
('00000000-0000-0000-0000-000000000001', '張三', '91234567', 'demo@demo.com', 'owner', NULL, '2024-01-01'),
('00000000-0000-0000-0000-000000000001', '李四', '92345678', 'lisi@demo.com', 'manager', NULL, '2024-03-15'),
('00000000-0000-0000-0000-000000000001', '王五', '93456789', 'wangwu@demo.com', 'staff', 55, '2024-06-01'),
('00000000-0000-0000-0000-000000000001', '趙六', '94567890', 'zhaoliu@demo.com', 'staff', 50, '2024-08-20');

-- Update owner and manager salaries
UPDATE employees SET monthly_salary = 25000 WHERE email = 'demo@demo.com';
UPDATE employees SET monthly_salary = 18000 WHERE email = 'lisi@demo.com';

-- Insert demo inventory
INSERT INTO inventory (restaurant_id, category, name, unit, current_stock, min_stock_level, supplier) VALUES
('00000000-0000-0000-0000-000000000001', '糖水配料', '仙草粉', '包', 400, 50, '供應商A'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '黑糖珍珠', '包', 66, 30, '供應商A'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '西柚粒', '罐', 24, 10, '供應商B'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '紫米', '罐', 24, 10, '供應商B'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '椰果', '包', 30, 20, '供應商A'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '黑糖粉條', '包', 5, 20, '供應商A'),
('00000000-0000-0000-0000-000000000001', '糖水配料', '黑糖漿', '桶', 23, 5, '供應商A'),
('00000000-0000-0000-0000-000000000001', '茶用品', '飲品糖漿', '桶', 10, 3, '供應商C'),
('00000000-0000-0000-0000-000000000001', '茶用品', '飲管', '包', 5, 10, '供應商C'),
('00000000-0000-0000-0000-000000000001', '茶用品', '鴨屎香茶葉', '包', 3, 5, '供應商D'),
('00000000-0000-0000-0000-000000000001', '碗/杯/袋/用具', '大膠袋', '個', 5000, 1000, '供應商E'),
('00000000-0000-0000-0000-000000000001', '碗/杯/袋/用具', '中膠袋', '個', 5000, 1000, '供應商E'),
('00000000-0000-0000-0000-000000000001', '碗/杯/袋/用具', '細膠袋', '個', 5000, 1000, '供應商E'),
('00000000-0000-0000-0000-000000000001', '煎餅配料', '咸蛋黃', '包', 5, 10, '供應商F'),
('00000000-0000-0000-0000-000000000001', '煎餅配料', '朱古力粒', '包', 24, 10, '供應商F'),
('00000000-0000-0000-0000-000000000001', '煎餅配料', '芝士醬', '包', 10, 5, '供應商F'),
('00000000-0000-0000-0000-000000000001', '煎餅配料', '麻糬', '包', 21, 10, '供應商F'),
('00000000-0000-0000-0000-000000000001', '雜物', '一次性手套（S碼）', '盒', 10, 5, '供應商E'),
('00000000-0000-0000-0000-000000000001', '雜物', '一次性手套（M碼）', '盒', 20, 5, '供應商E'),
('00000000-0000-0000-0000-000000000001', '雜物', '紙巾', '包', 36, 10, '供應商E');

-- Note: Run 002_import_data.sql after this to import full product list (94 items)
