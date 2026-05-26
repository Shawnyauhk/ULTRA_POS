-- =============================================
-- 打卡系統 QR Code Token 表 + attendance 補充欄位
-- 公司手機每10秒生成一次動態 QR Code，員工掃碼打卡
-- =============================================

-- 補充 attendance 表缺少的欄位
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='restaurant_id') THEN
    ALTER TABLE attendance ADD COLUMN restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_in_ip') THEN
    ALTER TABLE attendance ADD COLUMN clock_in_ip TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='clock_out_ip') THEN
    ALTER TABLE attendance ADD COLUMN clock_out_ip TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='verification_method') THEN
    ALTER TABLE attendance ADD COLUMN verification_method TEXT;
  END IF;
END $$;

-- QR Code Token 表
CREATE TABLE IF NOT EXISTS attendance_qrcode_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  device_id VARCHAR(100),
  device_ip VARCHAR(45) NOT NULL,        -- 公司手機的公網IP
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 索引：快速查找未過期、未使用的 token
CREATE INDEX IF NOT EXISTS idx_qrcode_token_lookup 
  ON attendance_qrcode_tokens(token, expires_at, used);

-- 索引：按餐廳清理過期 token
CREATE INDEX IF NOT EXISTS idx_qrcode_token_restaurant 
  ON attendance_qrcode_tokens(restaurant_id, created_at);

-- 自動清理過期 token 的函數（可排程或手動調用）
CREATE OR REPLACE FUNCTION cleanup_expired_qrcode_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM attendance_qrcode_tokens WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- RLS：僅管理員可以讀取 token（打卡時讀取驗證）
ALTER TABLE attendance_qrcode_tokens ENABLE ROW LEVEL SECURITY;

-- 任何人都可以查詢未過期的 token（員工掃碼時需要）
CREATE POLICY "Anyone can read valid tokens" 
  ON attendance_qrcode_tokens FOR SELECT 
  USING (expires_at > now());

-- 僅服務端可以插入/更新 token
CREATE POLICY "Service role can manage tokens" 
  ON attendance_qrcode_tokens FOR ALL 
  USING (auth.role() = 'service_role');
