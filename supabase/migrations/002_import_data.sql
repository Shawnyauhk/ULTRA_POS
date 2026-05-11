-- ========================================
-- ULTRA_POS 完整產品數據導入
-- 家傳x飲得 - 正確產品資料
-- ========================================
-- 在 Supabase SQL Editor 運行此腳本

BEGIN;

-- ========================================
-- 創建所有分類
-- ========================================

INSERT INTO categories (restaurant_id, name, sort_order) VALUES
('00000000-0000-0000-0000-000000000001', '鎖匙扣', 1),
('00000000-0000-0000-0000-000000000001', '格仔餅', 2),
('00000000-0000-0000-0000-000000000001', '雞蛋仔', 3),
('00000000-0000-0000-0000-000000000001', '小食', 4),
('00000000-0000-0000-0000-000000000001', '豆花芋圓', 5),
('00000000-0000-0000-0000-000000000001', '仙草芋圓', 6),
('00000000-0000-0000-0000-000000000001', '新式糖水', 7),
('00000000-0000-0000-0000-000000000001', '香蕉餅/蛋餅', 8),
('00000000-0000-0000-0000-000000000001', '蒸點', 9),
('00000000-0000-0000-0000-000000000001', '椰香西米露', 10),
('00000000-0000-0000-0000-000000000001', '飲品', 11)
ON CONFLICT DO NOTHING;

-- ========================================
-- 產品數據 (94項)
-- ========================================

-- 鎖匙扣 (1項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '鎖匙扣', 20, 'available'
FROM categories WHERE name = '鎖匙扣'
ON CONFLICT DO NOTHING;

-- 格仔餅 (10項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '原味格仔餅', 26, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '牛油咖央格仔餅', 32, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '開心果格仔餅', 42, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '金莎醬格仔餅', 26, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '香蕉朱古力格仔餅', 36, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雪糕格仔餅', 38, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芝士肉鬆格仔餅', 36, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '榛子朱古力醬格仔餅', 26, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥肉鬆格仔餅', 38, 'available'
FROM categories WHERE name = '格仔餅'
ON CONFLICT DO NOTHING;

-- 雞蛋仔 (16項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '原味雞蛋仔', 20, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '葡撻雞蛋仔', 38, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '麻糬雞蛋仔', 30, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '牛油咖央雞蛋仔', 28, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '煉奶花生醬雞蛋仔', 28, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '咸蛋黃雞蛋仔', 30, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雪糕雞蛋仔', 32, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芝士葡撻雞蛋仔', 42, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芝士肉鬆雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '朱古力雞蛋仔', 28, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雙重芝士雞蛋仔', 32, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '紫菜肉鬆雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '粟米芝士雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '粟米肉鬆雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '粟米紫菜雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥肉鬆雞蛋仔', 36, 'available'
FROM categories WHERE name = '雞蛋仔'
ON CONFLICT DO NOTHING;

-- 小食 (6項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '杜拜朱古力麻糬', 38, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '黑椒腸', 13, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '忌廉小泡芙', 12, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '青提葫蘆', 12, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '草莓葫蘆', 13, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '原味腸', 12, 'available'
FROM categories WHERE name = '小食'
ON CONFLICT DO NOTHING;

-- 豆花芋圓 (6項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花一號', 38, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花二號', 36, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花三號', 36, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花四號', 36, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花五號', 36, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '豆花大滿貫', 49, 'available'
FROM categories WHERE name = '豆花芋圓'
ON CONFLICT DO NOTHING;

-- 仙草芋圓 (6項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草一號', 38, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草二號', 36, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草三號', 36, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草四號', 36, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草五號', 36, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '仙草大滿貫', 49, 'available'
FROM categories WHERE name = '仙草芋圓'
ON CONFLICT DO NOTHING;

-- 新式糖水 (7項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '麻薯開心果糊', 45, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '多芒小丸子', 44, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '多芒小丸子紫米', 46, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '黃小桂', 46, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雪頂多芒小丸子', 48, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '楊枝甘露', 46, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥麻薯小丸子', 46, 'available'
FROM categories WHERE name = '新式糖水'
ON CONFLICT DO NOTHING;

-- 香蕉餅/蛋餅 (11項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '台式蛋餅', 24, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, 'Oreo粒朱古力醬香蕉煎餅', 36, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '美祿朱古力香蕉煎餅', 35, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '杜拜麻糬朱古力香蕉煎餅', 48, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '煉奶醬香蕉煎餅', 31, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '開心果香蕉煎餅', 42, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '花生粒醬香蕉煎餅', 35, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雪糕香蕉煎餅', 36, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芝士肉鬆香蕉煎餅', 38, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '榛子醬香蕉煎餅', 35, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '阿華田脆脆香蕉煎餅', 36, 'available'
FROM categories WHERE name = '香蕉餅/蛋餅'
ON CONFLICT DO NOTHING;

-- 蒸點 (10項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, 'XO醬炒腸粉', 42, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '撈面', 16, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '撈麵套餐', 29, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '香菇豬肉燒賣7粒', 15, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '腸粉4條', 14, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '腸粉套餐', 24, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '沙嗲牛肉面', 42, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '山竹牛肉', 15, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '魚蛋8粒', 12, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '魚肉燒賣7粒', 12, 'available'
FROM categories WHERE name = '蒸點'
ON CONFLICT DO NOTHING;

-- 椰香西米露 (11項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '椰香西米露', 29, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芒果椰香西米露', 40, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '桃膠椰香西米露', 38, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '紅豆椰香西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '西瓜椰香西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '香蕉椰香西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雪燕桃膠西米', 46, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '紫米西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥椰香西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋圓椰香西米露', 38, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '雲尼拿雪糕椰香西米露', 35, 'available'
FROM categories WHERE name = '椰香西米露'
ON CONFLICT DO NOTHING;

-- 飲品 (11項)
INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '碧根果酸奶昔', 36, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芒椰奶西', 36, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '開心果鮮奶冰', 42, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '西瓜沙冰', 32, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '鮮奶茶', 24, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '珍珠鮮奶茶', 28, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '手打苦瓜鴨屎香檸檬茶', 34, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '手打鴨屎香檸檬茶', 30, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '酸奶昔', 32, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥珍珠鲜奶', 32, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

INSERT INTO products (restaurant_id, category_id, name, price, status)
SELECT '00000000-0000-0000-0000-000000000001', id, '芋泥紫米椰奶', 32, 'available'
FROM categories WHERE name = '飲品'
ON CONFLICT DO NOTHING;

COMMIT;

-- ========================================
-- 驗證導入結果
-- ========================================

SELECT 
  '產品統計' as info,
  (SELECT COUNT(*) FROM products) as 總產品數,
  (SELECT COUNT(*) FROM categories) as 分類數;

-- 按分類統計產品
SELECT 
  c.name as 分類,
  COUNT(p.id) as 產品數
FROM categories c
LEFT JOIN products p ON c.id = p.category_id
GROUP BY c.name, c.sort_order
ORDER BY c.sort_order;
