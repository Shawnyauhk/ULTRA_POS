-- ========================================
-- ULTRA_POS - 員工與薪酬、排班、打卡三大模組整合
-- 資料庫結構遷移腳本
-- 
-- 設計原則：
--  1. 排班為核心：員工打卡資格由排班決定
--  2. 僅當天有排班的員工可打卡
--  3. 打卡記錄與排班工時自動串聯計算薪酬
--  4. 補打卡、調班申請皆需管理員審批
-- ========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. 增強員工表 (employees)
-- ========================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'staff';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_type TEXT CHECK (salary_type IN ('hourly', 'monthly', 'daily')) DEFAULT 'hourly';
-- work_days: 0=週日, 1=週一, ..., 6=週六，陣列表示每週工作日
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5];
-- 每月固定休息天数（用於月薪員工計算加班）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_rest_days INTEGER DEFAULT 0;
-- 預設工作時長（分鐘/天）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS default_shift_minutes INTEGER DEFAULT 540;
-- 入職試用期結束日
ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end DATE;
-- 備註
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes TEXT;
-- 更新時間戳
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ========================================
-- 2. 增強排班表 (schedules)
-- ========================================
-- 調整原有欄位
ALTER TABLE schedules DROP COLUMN IF EXISTS created_at;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('scheduled', 'confirmed', 'absent', 'day_off', 'cancelled')) DEFAULT 'scheduled';
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS shift_type TEXT CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'night', 'full_day', 'split')) DEFAULT 'full_day';
-- 休息時間（分鐘），打卡時不計入工時
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
-- 建立者（管理員）
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- 最後更新者
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES employees(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- 備註
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS notes TEXT;
-- 排班版本（用於檢測衝突）
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 新增複合唯一約束：每人每天只能有一筆 confirmed 排班
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_employee_date_confirmed 
ON schedules(employee_id, date) WHERE status IN ('scheduled', 'confirmed');

-- ========================================
-- 3. 調班/代班申請表 (schedule_changes)
-- ========================================
CREATE TABLE IF NOT EXISTS schedule_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  -- 原始排班（若是代班或頂班，則為原員工的排班）
  original_schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  original_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  original_start_time TIME NOT NULL,
  original_end_time TIME NOT NULL,
  -- 新排班
  new_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  new_date DATE,
  new_start_time TIME,
  new_end_time TIME,
  -- 申請類型
  -- temp_assign:    管理員臨時調動
  -- swap_request:   員工申請換班（對換）
  -- leave_request:  員工請假申請
  -- cover_request:  員工申請頂班
  change_type TEXT CHECK (change_type IN ('temp_assign', 'swap_request', 'leave_request', 'cover_request')) NOT NULL,
  -- 狀態
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
  -- 申請人
  requested_by UUID REFERENCES employees(id) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  -- 審批人
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  approved_notes TEXT,
  -- 原因/備註
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedule_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated to read schedule_changes"
  ON schedule_changes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow manager+ to update schedule_changes"
  ON schedule_changes FOR UPDATE TO authenticated 
  USING (true);

CREATE INDEX IF NOT EXISTS idx_schedule_changes_employee ON schedule_changes(original_employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_new_employee ON schedule_changes(new_employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_status ON schedule_changes(status);
CREATE INDEX IF NOT EXISTS idx_schedule_changes_date ON schedule_changes(original_date);

-- ========================================
-- 4. 增強打卡記錄表 (attendance)
-- ========================================
-- 打卡狀態
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT CHECK (
  status IN ('ontime', 'late', 'early', 'absent', 'forgot_clock_in', 'forgot_clock_out', 'missed')
) DEFAULT NULL;
-- 遲到分鐘數
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
-- 早退分鐘數
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS early_minutes INTEGER DEFAULT 0;
-- 對應的排班ID
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;
-- 打卡裝置ID
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_id TEXT;
-- 打卡位置（JSONB，可存座標或地址）
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location JSONB;
-- 備註
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS notes TEXT;
-- 更新時間戳
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- 複合唯一約束：每人每天只能有一筆打卡記錄
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_employee_date 
ON attendance(employee_id, date);

-- ========================================
-- 5. 增強補打卡申請表 (attendance_corrections)
-- ========================================
-- 對應的排班（用於計算是否算遲到）
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;
-- 申請的上班/下班時間（用於重新計算 status 和 late_minutes）
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS target_clock_in TIME;
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS target_clock_out TIME;
-- 申請人可選填希望的工作時長（分鐘）
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS expected_work_minutes INTEGER;
-- 補打卡通過後是否重新計算工時
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS recalculate_hours BOOLEAN DEFAULT true;
-- 更新時間戳
ALTER TABLE attendance_corrections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ========================================
-- 6. 薪資結算期表 (salary_periods)
-- ========================================
CREATE TABLE IF NOT EXISTS salary_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  -- 結算類型
  period_type TEXT CHECK (period_type IN ('weekly', 'biweekly', 'monthly')) DEFAULT 'monthly',
  -- 結算期起訖
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- 狀態
  -- open:       開放（員工可打卡，管理員可調整）
  -- calculating: 計算中（系統處理薪資）
  -- closed:     已結算（薪資已鎖定）
  status TEXT CHECK (status IN ('open', 'calculating', 'closed')) DEFAULT 'open',
  -- 總員工數
  total_employees INTEGER DEFAULT 0,
  -- 總工時
  total_hours NUMERIC(10,2) DEFAULT 0,
  -- 總薪資支出
  total_salary NUMERIC(12,2) DEFAULT 0,
  -- 備註
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES employees(id),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES employees(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, period_start, period_end)
);

ALTER TABLE salary_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow manager+ to manage salary_periods"
  ON salary_periods FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role IN ('owner', 'manager')
  ));

CREATE INDEX IF NOT EXISTS idx_salary_periods_restaurant ON salary_periods(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_salary_periods_status ON salary_periods(status);

-- ========================================
-- 7. 薪資明細表 (salary_records)
-- ========================================
CREATE TABLE IF NOT EXISTS salary_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  -- 結算期
  period_id UUID REFERENCES salary_periods(id) ON DELETE CASCADE,
  -- 員工
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  -- 工時統計
  scheduled_hours NUMERIC(6,2) DEFAULT 0,    -- 排班總時長
  worked_hours NUMERIC(6,2) DEFAULT 0,       -- 實際打卡總時長
  overtime_hours NUMERIC(6,2) DEFAULT 0,      -- 加班時長
  late_minutes INTEGER DEFAULT 0,            -- 總遲到分鐘
  early_minutes INTEGER DEFAULT 0,           -- 總早退分鐘
  absent_hours NUMERIC(6,2) DEFAULT 0,       -- 缺席時長（曠職）
  -- 薪資計算
  base_salary NUMERIC(12,2) DEFAULT 0,       -- 基本薪資
  hourly_earned NUMERIC(12,2) DEFAULT 0,     -- 時薪所得
  overtime_pay NUMERIC(12,2) DEFAULT 0,      -- 加班費
  late_deduction NUMERIC(12,2) DEFAULT 0,    -- 遲到扣款
  early_deduction NUMERIC(12,2) DEFAULT 0,  -- 早退扣款
  absent_deduction NUMERIC(12,2) DEFAULT 0, -- 曠職扣款
  bonus NUMERIC(12,2) DEFAULT 0,             -- 獎金
  other_deductions NUMERIC(12,2) DEFAULT 0, -- 其他扣款
  final_salary NUMERIC(12,2) DEFAULT 0,      -- 最終薪資
  -- 詳情（JSONB 保存計算明細供審計）
  calculation_detail JSONB,
  -- 狀態
  -- pending:   待確認
  -- confirmed: 已確認
  -- paid:      已發放
  status TEXT CHECK (status IN ('pending', 'confirmed', 'paid')) DEFAULT 'pending',
  -- 確認/發放
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES employees(id),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES employees(id),
  -- 備註
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (period_id, employee_id)
);

ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow manager+ to manage salary_records"
  ON salary_records FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role IN ('owner', 'manager')
  ));

CREATE POLICY "Allow employee to read own salary_record"
  ON salary_records FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_salary_records_period ON salary_records(period_id);
CREATE INDEX IF NOT EXISTS idx_salary_records_employee ON salary_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_records_status ON salary_records(status);

-- ========================================
-- 8. 薪資參數表 (salary_settings)
-- ========================================
CREATE TABLE IF NOT EXISTS salary_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  -- 參數名
  param_key TEXT NOT NULL,
  param_value JSONB NOT NULL,
  -- 說明
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, param_key)
);

ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow manager+ to manage salary_settings"
  ON salary_settings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role IN ('owner', 'manager')
  ));

-- 插入預設薪資參數
INSERT INTO salary_settings (restaurant_id, param_key, param_value, description) VALUES
('00000000-0000-0000-0000-000000000001', 'overtime_rate', '{"multiplier": 1.5, "min_hours_after_shift": 2}'::jsonb, '加班費倍率（超時後）'),
('00000000-0000-0000-0000-000000000001', 'late_deduction', '{"per_minute": 0.5, "max_daily": 100}'::jsonb, '遲到扣款（每分鐘/每日上限）'),
('00000000-0000-0000-0000-000000000001', 'early_leave_deduction', '{"per_minute": 0.5, "max_daily": 100}'::jsonb, '早退扣款'),
('00000000-0000-0000-0000-000000000001', 'absent_deduction', '{"daily_multiplier": 1.0}'::jsonb, '曠職扣款倍率（按日薪計算）'),
('00000000-0000-0000-0000-000000000001', 'forgot_clock_deduction', '{"flat": 100}'::jsonb, '忘記打卡扣款（固定）'),
ON CONFLICT DO NOTHING;

-- ========================================
-- 9. 打卡許可橋接表 (attendance_eligibility)
-- 用途：根據排班決定哪些員工可以在哪些時間打卡
-- 此表由系統根據 schedules 自動維護，也可手動干預
-- ========================================
CREATE TABLE IF NOT EXISTS attendance_eligibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
  -- 許可類型
  eligibility_type TEXT CHECK (eligibility_type IN ('scheduled', 'manual', 'device_override')) DEFAULT 'scheduled',
  -- 是否可打卡
  can_clock_in BOOLEAN DEFAULT true,
  can_clock_out BOOLEAN DEFAULT true,
  -- 允許的打卡時段
  earliest_clock_in TIME,
  latest_clock_out TIME,
  -- 原因（當 manual 或 device_override 時）
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (employee_id, date)
);

ALTER TABLE attendance_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated to read eligibility"
  ON attendance_eligibility FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow manager+ to manage eligibility"
  ON attendance_eligibility FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() 
    AND e.role IN ('owner', 'manager')
  ));

CREATE INDEX IF NOT EXISTS idx_eligibility_employee_date ON attendance_eligibility(employee_id, date);

-- ========================================
-- 觸發器：當排班狀態變更時自動更新 attendance_eligibility
-- ========================================
CREATE OR REPLACE FUNCTION update_attendance_eligibility_on_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO attendance_eligibility (employee_id, date, schedule_id, eligibility_type, earliest_clock_in, latest_clock_out)
    VALUES (
      NEW.employee_id, 
      NEW.date, 
      NEW.id,
      'scheduled',
      NEW.start_time,
      NEW.end_time
    )
    ON CONFLICT (employee_id, date) DO UPDATE SET
      schedule_id = NEW.id,
      eligibility_type = 'scheduled',
      earliest_clock_in = NEW.start_time,
      latest_clock_out = NEW.end_time,
      can_clock_in = CASE WHEN NEW.status IN ('scheduled', 'confirmed') THEN true ELSE false END,
      can_clock_out = CASE WHEN NEW.status IN ('scheduled', 'confirmed') THEN true ELSE false END;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE attendance_eligibility
    SET 
      can_clock_in = CASE WHEN NEW.status IN ('scheduled', 'confirmed') THEN true ELSE false END,
      can_clock_out = CASE WHEN NEW.status IN ('scheduled', 'confirmed') THEN true ELSE false END,
      earliest_clock_in = NEW.start_time,
      latest_clock_out = NEW.end_time
    WHERE schedule_id = NEW.id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM attendance_eligibility WHERE schedule_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_schedule_eligibility_sync
AFTER INSERT OR UPDATE OR DELETE ON schedules
FOR EACH ROW EXECUTE FUNCTION update_attendance_eligibility_on_schedule_change();

-- ========================================
-- 觸發器：補打卡申請通過時自動更新打卡記錄
-- ========================================
CREATE OR REPLACE FUNCTION apply_attendance_correction()
RETURNS TRIGGER AS $$
DECLARE
  v_attendance_id UUID;
  v_late_minutes INTEGER := 0;
  v_early_minutes INTEGER := 0;
  v_work_minutes INTEGER;
  v_sched RECORD;
BEGIN
  -- 只有審批通過時才處理
  IF NEW.status = 'approved' AND OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- 查找對應的打卡記錄
    SELECT * INTO v_attendance_id 
    FROM attendance 
    WHERE employee_id = NEW.employee_id 
      AND date = NEW.correction_date 
    LIMIT 1;

    -- 獲取排班資訊
    SELECT * INTO v_sched
    FROM schedules
    WHERE employee_id = NEW.employee_id
      AND date = NEW.correction_date
    LIMIT 1;

    IF v_attendance_id IS NOT NULL AND v_sched.id IS NOT NULL THEN
      -- 更新現有打卡記錄
      IF NEW.correction_type = 'clock_in' THEN
        UPDATE attendance
        SET 
          clock_in = NEW.requested_time,
          updated_at = NOW()
        WHERE id = v_attendance_id;

        -- 重新計算遲到
        IF v_sched.start_time IS NOT NULL AND NEW.requested_time > v_sched.start_time THEN
          v_late_minutes = EXTRACT(EPOCH FROM (NEW.requested_time - v_sched.start_time)) / 60;
          UPDATE attendance SET late_minutes = v_late_minutes WHERE id = v_attendance_id;
        END IF;

      ELSIF NEW.correction_type = 'clock_out' THEN
        UPDATE attendance
        SET 
          clock_out = NEW.requested_time,
          updated_at = NOW()
        WHERE id = v_attendance_id;

        -- 重新計算早退
        IF v_sched.end_time IS NOT NULL AND NEW.requested_time < v_sched.end_time THEN
          v_early_minutes = EXTRACT(EPOCH FROM (v_sched.end_time - NEW.requested_time)) / 60;
          UPDATE attendance SET early_minutes = v_early_minutes WHERE id = v_attendance_id;
        END IF;
      END IF;

      -- 重新計算工時
      UPDATE attendance
      SET 
        work_hours = CASE 
          WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL THEN
            ROUND(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 - COALESCE(v_sched.break_minutes, 0)::numeric / 60, 2)
          ELSE work_hours
        END,
        updated_at = NOW()
      WHERE id = v_attendance_id;

      -- 標記已處理
      UPDATE attendance_corrections
      SET attendance_id = v_attendance_id, updated_at = NOW()
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_apply_attendance_correction
AFTER UPDATE OF status ON attendance_corrections
FOR EACH ROW EXECUTE FUNCTION apply_attendance_correction();

-- ========================================
-- 觸發器：排班申請通過時自動創建/更新排班
-- ========================================
CREATE OR REPLACE FUNCTION apply_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- 根據 change_type 處理
    IF NEW.change_type = 'temp_assign' OR NEW.change_type = 'cover_request' THEN
      -- 臨時調動或頂班：更新或創建新排班
      INSERT INTO schedules (employee_id, date, start_time, end_time, shift_type, break_minutes, status, created_by, notes)
      VALUES (
        COALESCE(NEW.new_employee_id, NEW.original_employee_id),
        COALESCE(NEW.new_date, NEW.original_date),
        COALESCE(NEW.new_start_time, NEW.original_start_time),
        COALESCE(NEW.new_end_time, NEW.original_end_time),
        CASE 
          WHEN NEW.new_start_time IS NOT NULL AND NEW.new_end_time IS NOT NULL 
          AND NEW.new_start_time < '12:00' AND NEW.new_end_time >= '12:00' THEN 'split'
          WHEN NEW.new_start_time IS NOT NULL AND NEW.new_start_time < '12:00' THEN 'morning'
          WHEN NEW.new_start_time IS NOT NULL AND NEW.new_start_time >= '14:00' THEN 'evening'
          ELSE 'full_day'
        END,
        0,
        'confirmed',
        NEW.approved_by,
        '由 ' || COALESCE(NEW.reason, '調班申請') || ' 批准'
      )
      ON CONFLICT (employee_id, date) WHERE status IN ('scheduled', 'confirmed')
      DO UPDATE SET
        start_time = COALESCE(NEW.new_start_time, schedules.start_time),
        end_time = COALESCE(NEW.new_end_time, schedules.end_time),
        updated_at = NOW(),
        updated_by = NEW.approved_by,
        notes = '由調班申請批准：' || COALESCE(NEW.reason, '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_apply_schedule_change
AFTER UPDATE OF status ON schedule_changes
FOR EACH ROW EXECUTE FUNCTION apply_schedule_change();

-- ========================================
-- 視圖：員工當日可打卡狀態（排班視圖）
-- ========================================
CREATE OR REPLACE VIEW v_today_schedule_status AS
SELECT 
  e.id AS employee_id,
  e.name AS employee_name,
  e.restaurant_id,
  e.role,
  e.salary_type,
  e.hourly_rate,
  COALESCE(s.id::text, 'no_schedule') AS schedule_id,
  COALESCE(s.date::text, CURRENT_DATE::text) AS date,
  COALESCE(s.start_time::text, NULL) AS scheduled_start,
  COALESCE(s.end_time::text, NULL) AS scheduled_end,
  COALESCE(s.status, 'none') AS schedule_status,
  COALESCE(s.break_minutes, 0) AS break_minutes,
  CASE 
    WHEN s.id IS NULL THEN false
    WHEN s.status IN ('absent', 'day_off', 'cancelled') THEN false
    ELSE true
  END AS can_clock_in,
  ae.can_clock_out,
  ae.earliest_clock_in,
  ae.latest_clock_out,
  a.id AS attendance_id,
  a.clock_in,
  a.clock_out,
  a.work_hours,
  a.status AS attendance_status,
  a.late_minutes,
  a.early_minutes
FROM employees e
LEFT JOIN schedules s ON s.employee_id = e.id AND s.date = CURRENT_DATE
LEFT JOIN attendance_eligibility ae ON ae.employee_id = e.id AND ae.date = CURRENT_DATE
LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = CURRENT_DATE
WHERE e.is_active = true;

-- ========================================
-- 視圖：薪資計算摘要（供管理員審核）
-- ========================================
CREATE OR REPLACE VIEW v_salary_summary AS
SELECT 
  sr.id AS record_id,
  sr.period_id,
  sr.employee_id,
  e.name AS employee_name,
  e.salary_type,
  e.hourly_rate,
  e.monthly_salary,
  sp.period_start,
  sp.period_end,
  sp.period_type,
  sr.scheduled_hours,
  sr.worked_hours,
  sr.overtime_hours,
  sr.late_minutes,
  sr.early_minutes,
  sr.absent_hours,
  sr.base_salary,
  sr.hourly_earned,
  sr.overtime_pay,
  sr.late_deduction,
  sr.early_deduction,
  sr.absent_deduction,
  sr.bonus,
  sr.other_deductions,
  sr.final_salary,
  sr.status AS record_status,
  sr.confirmed_at,
  sr.paid_at
FROM salary_records sr
JOIN employees e ON e.id = sr.employee_id
JOIN salary_periods sp ON sp.id = sr.period_id;

-- ========================================
-- 視圖：待處理申請儀表板（管理員視圖）
-- ========================================
CREATE OR REPLACE VIEW v_pending_approvals AS
SELECT 
  'attendance_correction' AS type,
  ac.id,
  ac.employee_id,
  e.name AS employee_name,
  ac.correction_date AS target_date,
  ac.correction_type,
  ac.requested_time,
  ac.reason,
  ac.status,
  ac.created_at,
  ac.restaurant_id
FROM attendance_corrections ac
JOIN employees e ON e.id = ac.employee_id
WHERE ac.status = 'pending'
UNION ALL
SELECT 
  'schedule_change' AS type,
  sc.id,
  sc.requested_by AS employee_id,
  req.name AS employee_name,
  sc.original_date AS target_date,
  sc.change_type AS correction_type,
  NULL::time AS requested_time,
  sc.reason,
  sc.status,
  sc.created_at,
  sc.restaurant_id
FROM schedule_changes sc
JOIN employees req ON req.id = sc.requested_by
WHERE sc.status = 'pending';

-- ========================================
-- 遷移完成提示
-- ========================================
-- 此腳本完成後需重啟應用
-- 如有運行時類型錯誤，請同步更新 src/types/index.ts 中的 TypeScript 介面
