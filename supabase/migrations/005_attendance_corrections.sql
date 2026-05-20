-- ========================================
-- ULTRA_POS - 补打卡审批系统
-- ========================================

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  correction_date DATE NOT NULL,                              -- 要补打卡的日期
  correction_type TEXT CHECK (correction_type IN ('clock_in', 'clock_out')) NOT NULL,
  requested_time TIME NOT NULL,                               -- 申请的时间
  reason TEXT,                                                -- 申请原因
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by UUID REFERENCES employees(id),                  -- 审核人
  reviewed_at TIMESTAMPTZ,                                    -- 审核时间
  review_notes TEXT,                                          -- 审核备注
  attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,  -- 通过后写入的打卡记录
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated to read corrections"
  ON attendance_corrections FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated to insert corrections"
  ON attendance_corrections FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated to update corrections"
  ON attendance_corrections FOR UPDATE
  TO authenticated USING (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_corrections_employee ON attendance_corrections(employee_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON attendance_corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON attendance_corrections(correction_date);
CREATE INDEX IF NOT EXISTS idx_corrections_restaurant ON attendance_corrections(restaurant_id);
