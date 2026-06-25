-- 修復 expenses 表缺少的欄位
-- 適用情境：遠端 Supabase 尚未執行 004/007/008/009 遷移，導致 OCR/手動新增支出時報
-- "Could not find the 'invoice' column of 'expenses' in the schema cache"
-- 在 Supabase Dashboard → SQL Editor 貼上並執行一次即可

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS handler TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS supplier TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice TEXT DEFAULT '';

-- 確保 authenticated 使用者可以新增/修改/刪除 expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expenses' AND policyname = 'Allow authenticated users to insert expenses'
  ) THEN
    CREATE POLICY "Allow authenticated users to insert expenses"
      ON expenses FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expenses' AND policyname = 'Allow authenticated users to update expenses'
  ) THEN
    CREATE POLICY "Allow authenticated users to update expenses"
      ON expenses FOR UPDATE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expenses' AND policyname = 'Allow authenticated users to delete expenses'
  ) THEN
    CREATE POLICY "Allow authenticated users to delete expenses"
      ON expenses FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- 確保 expenses 已加入 realtime 發布（若已存在則忽略錯誤）
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
EXCEPTION WHEN duplicate_table THEN
  RAISE NOTICE 'expenses 已存在於 supabase_realtime 發布中';
END $$;

