-- 為 expenses 表添加 payment_status 欄位
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
