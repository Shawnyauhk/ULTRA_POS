-- Add summary column to ai_sessions
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS summary TEXT;
