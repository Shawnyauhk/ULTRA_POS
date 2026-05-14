-- 為 expenses 表添加 supplier 欄位
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier TEXT DEFAULT '';
