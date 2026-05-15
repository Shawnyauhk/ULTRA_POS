-- AI Customer Service System
-- Sessions, Knowledge Base, AI Config

-- ============================================
-- 1. AI Sessions (對話會話)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_contact TEXT,
  status TEXT CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Update chat_messages to support multi-tenant
-- ============================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);

-- ============================================
-- 3. AI Knowledge Base (知識庫)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. AI Config (語氣/習慣/系統提示詞)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, config_key)
);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================
CREATE POLICY "Allow authenticated users to read ai_sessions"
  ON ai_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert ai_sessions"
  ON ai_sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update ai_sessions"
  ON ai_sessions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read ai_knowledge_base"
  ON ai_knowledge_base FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage ai_knowledge_base"
  ON ai_knowledge_base FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read ai_config"
  ON ai_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage ai_config"
  ON ai_config FOR ALL TO authenticated USING (true);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ai_sessions_restaurant ON ai_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created ON ai_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_restaurant ON chat_messages(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_restaurant ON ai_knowledge_base(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_category ON ai_knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_ai_config_restaurant ON ai_config(restaurant_id);

-- ============================================
-- Insert Default AI Config for demo restaurant
-- ============================================
INSERT INTO ai_config (restaurant_id, config_key, config_value) VALUES
('00000000-0000-0000-0000-000000000001', 'system_prompt', '{
  "prompt": "你是一間港式小食店的AI客服助手，名叫「小幫手」。你必須用親切友善的粵語回覆客人。",
  "tone_description": "親切、友善、有禮貌，用粵語口語回覆",
  "personality": "熱情好客、樂於助人、對餐廳產品非常熟悉",
  "language": "粵語口語（廣東話）",
  "response_style": "簡潔直接，適當使用表情符號，回覆不超過100字"
}'::jsonb);

INSERT INTO ai_config (restaurant_id, config_key, config_value) VALUES
('00000000-0000-0000-0000-000000000001', 'business_hours', '{
  "monday": "11:00-22:00",
  "tuesday": "11:00-22:00",
  "wednesday": "11:00-22:00",
  "thursday": "11:00-22:00",
  "friday": "11:00-22:00",
  "saturday": "11:00-22:00",
  "sunday": "11:00-22:00"
}'::jsonb);

-- Insert demo knowledge base entries
INSERT INTO ai_knowledge_base (restaurant_id, category, question, answer) VALUES
('00000000-0000-0000-0000-000000000001', 'menu', '有咩甜品推薦？', '我哋最受歡迎嘅甜品包括：\n1. 招牌仙草芋圓 - 口感煙韌，仙草清香\n2. 豆花芋圓 - 滑嫩豆花配芋圓，絕配\n3. 椰香西米露 - 香濃椰汁，清涼消暑\n\n你想試邊款呀？😊'),
('00000000-0000-0000-0000-000000000001', 'menu', '雞蛋仔有咩口味？', '我哋嘅雞蛋仔口味多樣化：\n• 原味雞蛋仔 - 經典之選\n• 朱古力雞蛋仔 - 濃郁可可味\n• 芝士雞蛋仔 - 鹹香惹味\n• 抹茶雞蛋仔 - 日式風味\n\n仲可以加配料，例如麻糬、朱古力粒等！🤤'),
('00000000-0000-0000-0000-000000000001', 'hours', '幾點開門？', '我哋每日營業時間係 11:00 - 22:00，歡迎你隨時過嚟！🕐'),
('00000000-0000-0000-0000-000000000001', 'payment', '可以用咩俾錢？', '我哋接受以下付款方式：\n💵 現金\n📱 Alipay（支付寶）\n💚 WeChat Pay\n💳 Visa\n🟢 八達通\n\n方便又快捷！'),
('00000000-0000-0000-0000-000000000001', 'delivery', '有冇外賣或者送貨？', '有㗎！你可以即場叫外賣自取，或者經外賣平台落單。如果大量訂購，歡迎打電話同我哋聯絡，我哋可以安排送貨㗎！📞'),
('00000000-0000-0000-0000-000000000001', 'menu', '格仔餅有咩特色？', '我哋嘅格仔餅即叫即製，外脆內軟！\n熱門口味：\n• 原味格仔餅 - 傳統滋味\n• 鹹蛋黃格仔餅 - 鹹香創新\n• 麻糬格仔餅 - 煙韌口感\n\n加埋炼奶同花生醬，超正！😋');
