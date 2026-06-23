-- 為 expenses 表添加 invoice 欄位
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice TEXT DEFAULT '';
