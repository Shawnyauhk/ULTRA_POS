-- 為 expenses 表加入 receipt_hash 欄位，用於圖像層面重複檢測
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_hash TEXT DEFAULT '';

-- 建立索引加速重複查詢
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_hash ON expenses(receipt_hash);
CREATE INDEX IF NOT EXISTS idx_expenses_description_amount ON expenses(description, amount);
