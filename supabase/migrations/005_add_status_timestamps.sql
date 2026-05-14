-- Add timestamp columns for each status transition
ALTER TABLE order_requests ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;
ALTER TABLE order_requests ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
