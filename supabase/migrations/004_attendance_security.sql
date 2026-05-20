-- ========================================
-- ULTRA_POS - 安全打卡系统
-- 店铺位置、生物识别、设备绑定、审计日志
-- ========================================

-- 店铺位置配置表
CREATE TABLE IF NOT EXISTS store_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,                -- '总店'、'分店A'
  latitude NUMERIC(10, 8) NOT NULL,           -- 纬度
  longitude NUMERIC(11, 8) NOT NULL,          -- 经度
  allowed_radius INTEGER DEFAULT 200,          -- 允许范围（公尺）
  wifi_ssid TEXT[],                            -- 允许的WiFi名称（预留）
  wifi_bssid TEXT[],                           -- 允许的WiFi MAC（预留）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 员工生物识别表（WebAuthn + PIN）
CREATE TABLE IF NOT EXISTS employee_biometrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  biometric_type TEXT CHECK (biometric_type IN ('pin', 'webauthn')) NOT NULL,
  credential_id TEXT,                          -- WebAuthn credential ID
  public_key TEXT,                             -- WebAuthn 公钥
  pin_hash TEXT,                               -- PIN 码哈希值
  pin_salt TEXT,                               -- PIN 码盐值
  device_name TEXT,                            -- 注册设备名
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 员工设备绑定表
CREATE TABLE IF NOT EXISTS employee_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,                     -- 设备指纹
  device_name TEXT,                            -- 设备名称
  user_agent TEXT,
  platform TEXT,
  language TEXT,
  screen_resolution TEXT,
  timezone TEXT,
  is_active BOOLEAN DEFAULT true,
  bound_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- 打卡审计日志表
CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  action TEXT CHECK (action IN ('clock_in', 'clock_out', 'edit', 'delete')) NOT NULL,
  action_by UUID REFERENCES employees(id),
  ip_address TEXT,
  device_info JSONB,
  location_info JSONB,
  verification_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 增强 attendance 表（添加验证信息字段）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_in_latitude') THEN
    ALTER TABLE attendance ADD COLUMN clock_in_latitude NUMERIC(10, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_in_longitude') THEN
    ALTER TABLE attendance ADD COLUMN clock_in_longitude NUMERIC(11, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_in_ip') THEN
    ALTER TABLE attendance ADD COLUMN clock_in_ip TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='verification_method') THEN
    ALTER TABLE attendance ADD COLUMN verification_method TEXT 
      CHECK (verification_method IN ('webauthn', 'pin', 'manual')) DEFAULT 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_out_latitude') THEN
    ALTER TABLE attendance ADD COLUMN clock_out_latitude NUMERIC(10, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_out_longitude') THEN
    ALTER TABLE attendance ADD COLUMN clock_out_longitude NUMERIC(11, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_out_ip') THEN
    ALTER TABLE attendance ADD COLUMN clock_out_ip TEXT;
  END IF;
END $$;

-- 启用 RLS
ALTER TABLE store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_biometrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略：允许已验证用户读取
CREATE POLICY "Allow authenticated to read store_locations"
  ON store_locations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to manage store_locations"
  ON store_locations FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to read own biometrics"
  ON employee_biometrics FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to manage own biometrics"
  ON employee_biometrics FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to read employee_devices"
  ON employee_devices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to manage employee_devices"
  ON employee_devices FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to read audit_logs"
  ON attendance_audit_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to insert audit_logs"
  ON attendance_audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_store_locations_restaurant ON store_locations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_employee_biometrics_employee ON employee_biometrics(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_devices_employee ON employee_devices(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_employee ON attendance_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_action ON attendance_audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);

-- 插入店铺位置（家傳芋曉 - 真實坐标）
INSERT INTO store_locations (restaurant_id, location_name, latitude, longitude, allowed_radius)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '家傳芋曉-总店', 22.464743, 114.003037, 200)
ON CONFLICT DO NOTHING;

-- 插入/更新店铺网络设置
INSERT INTO settings (restaurant_id, setting_key, setting_value, setting_type, description)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'store_location', '{"lat":22.464743,"lng":114.003037,"radius":200}', 'json', '店铺GPS位置'),
  ('00000000-0000-0000-0000-000000000001', 'store_wifi', '{"require_wifi":false,"ip_address":""}', 'json', '店铺WiFi验证设置')
ON CONFLICT DO NOTHING;
