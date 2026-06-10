-- ============================================
-- 015: 补全 schedules 表的 INSERT / UPDATE / DELETE RLS 策略
-- ============================================

-- INSERT 策略：只能新增自己餐廳員工的排班
CREATE POLICY "restaurant_isolation_insert" ON schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  );

-- UPDATE 策略：只能更新自己餐廳員工的排班
CREATE POLICY "restaurant_isolation_update" ON schedules
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  );

-- DELETE 策略：只能刪除自己餐廳員工的排班
CREATE POLICY "restaurant_isolation_delete" ON schedules
  FOR DELETE TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE restaurant_id = get_user_restaurant_id()
    )
  );
