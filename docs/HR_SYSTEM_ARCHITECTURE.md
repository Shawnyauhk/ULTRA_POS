# ULTRA_POS — 員工與薪酬、排班、打卡三模組整合架構

## 一、設計原則

| 原則 | 說明 |
|------|------|
| **排班驅動** | 打卡資格完全由排班決定，無排班則無法打卡 |
| **審批閉環** | 所有變更（調班、補打卡）皆需管理員審批後生效 |
| **自動串聯** | 打卡記錄 × 排班工時 → 自動計算薪酬 |
| **不可篡改** | 已結算薪資記錄鎖定，僅可留审计痕迹 |

---

## 二、資料庫關聯設計

```
restaurants (1)
    │
    ├── employees (N)
    │     ├── salary_type: 'hourly' | 'monthly' | 'daily'
    │     ├── hourly_rate / monthly_salary
    │     └── work_days: Integer[] (每週工作日)
    │
    ├── schedules (N) ────────────────────────────┐
    │     ├── status: scheduled/confirmed/absent/day_off/cancelled
    │     ├── shift_type: morning/afternoon/evening/night/full_day/split
    │     ├── break_minutes
    │     └── created_by → employees.id
    │
    ├── schedule_changes (N)                     │
    │     ├── change_type: temp_assign/swap_request/leave_request/cover_request
    │     ├── status: pending/approved/rejected/cancelled
    │     ├── requested_by → employees.id
    │     └── approved_by → employees.id
    │
    ├── attendance_eligibility (N) ◄── 觸發器自動維護
    │     ├── can_clock_in / can_clock_out
    │     ├── earliest_clock_in / latest_clock_out
    │     └── eligibility_type: scheduled/manual/device_override
    │
    ├── attendance (N)
    │     ├── schedule_id → schedules.id
    │     ├── status: ontime/late/early/absent/forgot_*
    │     ├── late_minutes / early_minutes
    │     └── location: JSONB {lat, lng, address}
    │
    ├── attendance_corrections (N)
    │     ├── status: pending/approved/rejected
    │     ├── reviewed_by → employees.id
    │     └── attendance_id → attendance.id
    │
    ├── salary_periods (N)
    │     ├── status: open/calculating/closed
    │     └── period_type: weekly/biweekly/monthly
    │
    └── salary_records (N)
          ├── period_id → salary_periods.id
          ├── regular_hours / overtime_hours
          ├── late_deduction / early_deduction / absent_deduction
          ├── bonus / other_deductions
          └── final_salary
```

### 核心觸發器

| 觸發器 | 時機 | 動作 |
|--------|------|------|
| `trg_schedule_eligibility_sync` | `schedules` INSERT/UPDATE/DELETE | 自動維護 `attendance_eligibility` |
| `trg_apply_attendance_correction` | `attendance_corrections.status` → approved | 自動更新對應 `attendance` 記錄並重算工時 |
| `trg_apply_schedule_change` | `schedule_changes.status` → approved | 自動創建/更新 `schedules` |

---

## 三、模組互動流程

### 3.1 打卡系統核心流程

```
┌──────────────────────────────────────────────────────────────┐
│                        員工打卡流程                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  員工打開打卡頁面                                             │
│       │                                                      │
│       ▼                                                      │
│  系統查詢 v_today_schedule_status 視圖                         │
│       │                                                      │
│       ├─ 有排班且狀態=confirmed/scheduled ──→ 顯示上班打卡按鈕 │
│       │                                              │        │
│       │   員工點擊「上班打卡」                          │        │
│       │         │                                     │        │
│       │         ▼                                     │        │
│       │   寫入 attendance (clock_in=now)              │        │
│       │   status = ontime / late                      │        │
│       │   late_minutes = max(0, clock_in - 排班start)  │        │
│       │                                                      │
│       ├─ 有上班打卡記錄 ──→ 顯示下班打卡按鈕                │
│       │                                              │        │
│       │   員工點擊「下班打卡」                          │        │
│       │         │                                     │        │
│       │         ▼                                     │        │
│       │   更新 attendance (clock_out=now)              │        │
│       │   early_minutes = max(0, 排班end - clock_out)  │        │
│       │   work_hours = clock_out - clock_in - break   │        │
│       │                                                      │
│       └─ 無有效排班 ──→ 顯示「今日無排班，無法打卡」         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**關鍵校驗邏輯（打卡時）：**
```
IF 當日 schedule.status IN ('absent', 'day_off', 'cancelled', NULL)
  → 拒絕打卡，提示「今日無有效排班」

IF attendance_eligibility.can_clock_in = false
  → 拒絕打卡（可能為手動關閉）

IF 已有 clock_in 且無 clock_out
  → 允許下班打卡

IF 已有 clock_in 且有 clock_out
  → 提示「今日已完成打卡」
```

### 3.2 排班管理流程

```
┌──────────────────────────────────────────────────────────────┐
│                      排班管理流程                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  〔管理員視角〕                                                │
│  ─────────────                                                │
│  1. 管理員在月曆點擊日期 → 選擇員工 → 設定班次                   │
│     → 直接寫入 schedules (status='confirmed')                  │
│     → 觸發器自動寫入 attendance_eligibility                    │
│                                                              │
│  2. 管理員臨時調動                                             │
│     → 寫入 schedule_changes (change_type='temp_assign')       │
│     → 待批准或直接批准                                         │
│     → 批准後觸發器自動更新/創建 schedules                       │
│                                                              │
│  〔員工視角〕                                                  │
│  ─────────────                                                │
│  3. 員工請假                                                   │
│     → 申請 schedule_changes (change_type='leave_request')     │
│     → status=pending                                            │
│                                                              │
│  4. 員工申請換班                                               │
│     → 申請 schedule_changes (change_type='swap_request')      │
│     → 系統通知對方員工確認                                      │
│     → 管理員最終批准                                           │
│                                                              │
│  5. 員工申請頂班                                               │
│     → 申請 schedule_changes (change_type='cover_request')      │
│     → 管理員批准後，頂班人獲得新排班                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 薪資計算流程

```
┌──────────────────────────────────────────────────────────────┐
│                      薪資結算流程                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  管理員關閉結算期                                              │
│       │                                                      │
│       ▼                                                      │
│  salary_periods.status → 'calculating'                        │
│       │                                                      │
│       ▼                                                      │
│  系統遍歷期內所有 attendance 記錄                                │
│       │                                                      │
│       ├─ 累計每員工：                                         │
│       │   scheduled_hours ← SUM(schedules 工作時長)           │
│       │   worked_hours    ← SUM(attendance.work_hours)       │
│       │   late_minutes    ← SUM(attendance.late_minutes)     │
│       │   early_minutes   ← SUM(attendance.early_minutes)    │
│       │   overtime_hours  ← MAX(0, worked_hours - scheduled)  │
│       │   absent_hours    ← 缺席時長                         │
│       │                                                      │
│       ├─ 計算薪資：                                           │
│       │   月薪員工：monthly_salary                            │
│       │   時薪員工：hourly_rate × worked_hours               │
│       │   加班費：   hourly_rate × overtime_hours × 1.5      │
│       │   遲到扣款：late_minutes × 每分鐘扣額                 │
│       │   早退扣款：early_minutes × 每分鐘扣額               │
│       │   缺席扣款：absent_hours × hourly_rate × 1.0        │
│       │   獎金/其他加減                                        │
│       │                                                      │
│       └─ 寫入 salary_records (final_salary)                   │
│                                                              │
│  管理員確認薪資明細                                             │
│       │                                                      │
│       ▼                                                      │
│  salary_periods.status → 'closed'                             │
│  salary_records.status → 'confirmed'                           │
│       │                                                      │
│       ▼                                                      │
│  管理員發放薪資                                                │
│       │                                                      │
│       ▼                                                      │
│  salary_records.status → 'paid'                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、系統架構

### 4.1 前端頁面結構

```
src/pages/
├── AttendancePage.tsx        # 打卡首頁（員工）
│   ├── 顯示當日排班（班次時間）
│   ├── 上班/下班打卡按鈕
│   ├── 當日工時累計
│   └── 補打卡申請入口
│
├── SchedulesPage.tsx        # 排班管理（月曆視圖）
│   ├── 月曆 Grid
│   ├── 管理員：直接新增/編輯排班
│   ├── 員工：查看個人排班
│   └── 待批准申請入口（管理員）
│
├── AttendanceDevicePage.tsx # 打卡裝置管理（管理員）
│   ├── QRCode / NFC 配置
│   └── 裝置狀態
│
├── SalaryPage.tsx           # 薪資管理（管理員）
│   ├── 結算期列表
│   ├── 薪資明細表
│   └── 發放記錄
│
└── EmployeePage.tsx          # 員工管理（管理員）
    ├── 員工名冊 CRUD
    ├── 薪資設定
    └── 在職/離職狀態
```

### 4.2 核心 API/RPC 設計

| 功能 | Supabase RPC / Query | 說明 |
|------|---------------------|------|
| 打卡 | `rpc('clock_in', {p_employee_id, p_device_id})` | 寫入 attendance，返回狀態 |
| 下班打卡 | `rpc('clock_out', {p_attendance_id})` | 更新 attendance |
| 查詢當日狀態 | `SELECT * FROM v_today_schedule_status WHERE employee_id = auth.uid()` | 視圖查詢 |
| 申請補打卡 | `INSERT attendance_corrections` | 寫入申請 |
| 批准補打卡 | `UPDATE attendance_corrections SET status='approved'` | 管理員專用 |
| 申請調班 | `INSERT schedule_changes` | 員工申請 |
| 批准調班 | `UPDATE schedule_changes SET status='approved'` | 管理員專用 |
| 計算薪資 | `rpc('calculate_salary', {p_period_id})` | 批量計算並寫入 salary_records |
| 結算薪資期 | `UPDATE salary_periods SET status='closed'` | 鎖定薪資 |

### 4.3 關鍵安全策略（RLS）

| 表 | 策略 |
|----|------|
| `employees` | 全部員工可查詢自己；管理員可寫入 |
| `schedules` | 全部員工可查詢；管理員可寫入 |
| `attendance` | 員工只讀自己；管理員可全部讀寫 |
| `attendance_corrections` | 員工只讀寫自己；管理員可全部讀寫 |
| `schedule_changes` | 員工只讀寫自己；管理員可全部讀寫 |
| `salary_periods` | 管理員可讀寫；員工可查詢狀態 |
| `salary_records` | 管理員可讀寫；員工只讀自己薪資 |

---

## 五、狀態機設計

### 5.1 排班狀態機

```
scheduled ──→ confirmed ──→ (員工打卡) ──→ completed
    │
    └──→ absent (請假批准)
    └──→ day_off (休息日)
    └──→ cancelled (管理員取消)
```

### 5.2 打卡狀態機

```
[上班打卡]
  │
  ├── ontime  (準時)
  ├── late    (遲到，記錄 late_minutes)
  └── forgot_clock_in (忘打卡，需補打卡申請)

[下班打卡]
  │
  ├── ontime  (正常)
  ├── early   (早退，記錄 early_minutes)
  └── forgot_clock_out (忘打卡，需補打卡申請)
```

### 5.3 申請審批狀態機

```
pending ──→ approved ──→ (自動執行業務邏輯)
    │
    └──→ rejected ──→ (終態)
    │
    └──→ cancelled ──→ (員工撤銷，終態)
```

---

## 六、補打卡與調班的特殊處理

### 6.1 補打卡申請流程

```
員工提交補打卡
    │
    ▼
管理員收到通知（待批准列表）
    │
    ├── 批准
    │     │
    │     ▼
    │   觸發器自動更新 attendance
    │     • 寫入 clock_in / clock_out
    │     • 重算 late_minutes / early_minutes
    │     • 重算 work_hours
    │     • 標記 attendance_id
    │
    └── 拒絕
          │
          ▼
        記錄拒絕原因，完成
```

### 6.2 調班申請流程

```
員工 A 申請與 B 換班
    │
    ▼
系統通知員工 B 確認意願
    │
    ├── B 拒絕 ──→ 申請終止
    │
    └── B 確認 ──→ 管理員審批
                      │
                      ├── 批准
                      │     │
                      │     ▼
                      │   觸發器更新雙方 schedules
                      │   • A 獲得 B 的班次
                      │   • B 獲得 A 的班次
                      │   • 更新 attendance_eligibility
                      │
                      └── 拒絕
                            │
                            ▼
                          記錄原因，完成
```

---

## 七、打卡頁面佈局（員工視角）

```
┌──────────────────────────────────────┐
│  ← 返回    打卡    [設定]             │
├──────────────────────────────────────┤
│                                      │
│  張三                              │
│  服務員                             │
│                                      │
│  ┌──────────────────────────────┐   │
│  │    6 月 2 日（週二）          │   │
│  │                              │   │
│  │   09:00 ─────── 18:00       │   │
│  │   [上班 09:02 ✅]           │   │
│  │                              │   │
│  │   已工作 4 小時 32 分鐘       │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  [🔴 下班打卡]               │   │
│  │  (預計 18:00 可打卡)         │   │
│  └──────────────────────────────┘   │
│                                      │
│  本週累計：32 小時 15 分鐘            │
│                                      │
│  [📋 補打卡申請]  [📅 我的排班]      │
│                                      │
└──────────────────────────────────────┘
```

---

## 八、已創建的遷移文件清單

| 文件 | 內容 |
|------|------|
| `supabase/migrations/007_hr_system_schema.sql` | 完整資料庫結構、觸發器、視圖 |
