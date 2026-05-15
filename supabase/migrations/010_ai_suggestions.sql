-- AI Suggestions Table (对话建议/修正反馈)
-- 用于记录管理员对AI回复的修正建议，自动同步到知识库

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  message_id UUID NOT NULL,
  role TEXT NOT NULL,
  original_question TEXT,
  original_answer TEXT,
  suggested_answer TEXT NOT NULL,
  notes TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to manage ai_suggestions"
  ON ai_suggestions FOR ALL TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_session ON ai_suggestions(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_message ON ai_suggestions(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_restaurant ON ai_suggestions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status);
