-- 新增 Payme 支付方式欄位
ALTER TABLE daily_settlements
ADD COLUMN IF NOT EXISTS payme NUMERIC(12,2) DEFAULT 0;
