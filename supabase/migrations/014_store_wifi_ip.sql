-- =============================================
-- 門店 WiFi IP 記錄表
-- 門店裝置定期上報公網 IP，員工打卡時比對
-- 純 IP 驗證打卡，無需 QR Code
-- =============================================

CREATE TABLE IF NOT EXISTS store_wifi_ip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE UNIQUE,
  public_ip TEXT NOT NULL,
  device_id VARCHAR(100),
  last_update TIMESTAMPTZ DEFAULT now()
);

-- 索引：按餐廳查詢
CREATE INDEX IF NOT EXISTS idx_store_wifi_ip_restaurant
  ON store_wifi_ip(restaurant_id, last_update);

-- 自動清理舊記錄（保留每家店最新的 100 條）
CREATE OR REPLACE FUNCTION cleanup_old_store_ips()
RETURNS void AS $$
BEGIN
  DELETE FROM store_wifi_ip
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY last_update DESC) AS rn
      FROM store_wifi_ip
    ) sub WHERE rn <= 100
  );
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE store_wifi_ip ENABLE ROW LEVEL SECURITY;

-- 任何人都可以查詢（打卡時需要）
CREATE POLICY "Anyone can read store wifi ip"
  ON store_wifi_ip FOR SELECT
  USING (true);

-- 僅服務端可以管理
CREATE POLICY "Service role can manage store wifi ip"
  ON store_wifi_ip FOR ALL
  USING (auth.role() = 'service_role');
