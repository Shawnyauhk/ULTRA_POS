-- ========================================
-- ULTRA_POS - 智能排班系统
-- 新增：员工不可用日期标记 + 排班规则
-- ========================================

-- 1. 员工不可用日期表
CREATE TABLE IF NOT EXISTS employee_unavailability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

ALTER TABLE employee_unavailability ENABLE ROW LEVEL SECURITY;

-- 所有人可读自己的
CREATE POLICY "Allow read own unavailability"
  ON employee_unavailability FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR EXISTS (
    SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')
  ));

-- 员工只能管理自己的，管理员可管理全部
CREATE POLICY "Allow manage unavailability"
  ON employee_unavailability FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR EXISTS (
    SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')
  ));

CREATE POLICY "Allow delete own unavailability"
  ON employee_unavailability FOR DELETE TO authenticated
  USING (employee_id = auth.uid() OR EXISTS (
    SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')
  ));

CREATE INDEX IF NOT EXISTS idx_unavail_employee_date ON employee_unavailability(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_unavail_date ON employee_unavailability(date);
CREATE INDEX IF NOT EXISTS idx_unavail_restaurant ON employee_unavailability(restaurant_id);

-- 2. 排班规则表
CREATE TABLE IF NOT EXISTS scheduling_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('no_same_shift', 'priority', 'balanced', 'min_rest', 'max_consecutive', 'fixed_shift', 'custom')),
  -- rule_config:
  --   no_same_shift:       { "employee_ids": ["A","B"] }
  --   priority:            { "employee_ids": ["A","B"] }
  --   balanced:            { "target_shifts_per_week": 5 }
  --   min_rest:            { "hours": 12 }
  --   max_consecutive:     { "days": 5 }
  --   fixed_shift:         { "employee_id": "A", "shift": "morning" }
  rule_config JSONB NOT NULL DEFAULT '{}',
  label TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scheduling_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow manager+ to manage scheduling_rules"
  ON scheduling_rules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('owner', 'manager')
  ));

CREATE POLICY "Allow all to read scheduling_rules"
  ON scheduling_rules FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_sched_rules_restaurant ON scheduling_rules(restaurant_id);
