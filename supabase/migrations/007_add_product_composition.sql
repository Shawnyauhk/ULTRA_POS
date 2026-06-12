-- 為 products 表新增 composition（配料組成）欄位
-- 用途：AI 好評生成、客服回答、員工查看、考核出題
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS composition TEXT DEFAULT '';
