-- ========================================
-- ULTRA_POS - 現金日結新增留底金欄位
-- ========================================

ALTER TABLE cash_register ADD COLUMN IF NOT EXISTS retained_balance NUMERIC(10,2) DEFAULT 1500.00;

COMMENT ON COLUMN cash_register.retained_balance IS '員工實際決定留給明天的底金（預設1500，可修改）';
