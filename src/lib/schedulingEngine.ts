// ========================================
// 智能排班引擎 - Scheduling Engine
// ========================================

export interface SchedulingRule {
  id?: string
  restaurant_id?: string
  rule_type: 'no_same_shift' | 'priority' | 'balanced' | 'min_rest' | 'max_consecutive' | 'fixed_shift' | 'custom'
  rule_config: Record<string, any>
  label?: string
  is_active?: boolean
  sort_order?: number
}

export interface Unavailability {
  employee_id: string
  date: string
  reason?: string
}

export interface ShiftAssignment {
  date: string
  morning: string[]   // employee IDs
  evening: string[]   // employee IDs
}

export interface GenerateOptions {
  year: number
  month: number       // 1-12
  employees: { id: string; name: string; role: string }[]
  unavailability: Unavailability[]
  rules: SchedulingRule[]
  morningCount?: number   // 每班早更人数，默认2
  eveningCount?: number   // 每班晚更人数，默认2
}

// ========================================
// 核心排班算法
// ========================================

export function generateSchedule(options: GenerateOptions): ShiftAssignment[] {
  const {
    year,
    month,
    employees,
    unavailability,
    rules,
    morningCount = 2,
    eveningCount = 2,
  } = options

  const daysInMonth = new Date(year, month, 0).getDate()
  const result: ShiftAssignment[] = []

  // Build unavailable lookup: { "employeeId_date": true }
  const unavailableMap = new Set<string>()
  for (const u of unavailability) {
    unavailableMap.add(`${u.employee_id}_${u.date}`)
  }

  // Parse rules
  const noSameShiftPairs = new Set<string>()
  const priorityIds = new Set<string>()
  const fixedShifts: Record<string, 'morning' | 'evening'> = {}
  let isBalanced = false

  for (const rule of rules) {
    if (!rule.is_active) continue
    switch (rule.rule_type) {
      case 'no_same_shift': {
        const ids: string[] = rule.rule_config?.employee_ids || []
        if (ids.length === 2) {
          noSameShiftPairs.add(`${ids[0]}_${ids[1]}`)
          noSameShiftPairs.add(`${ids[1]}_${ids[0]}`)
        }
        break
      }
      case 'priority': {
        const ids: string[] = rule.rule_config?.employee_ids || []
        ids.forEach(id => priorityIds.add(id))
        break
      }
      case 'balanced':
        isBalanced = true
        break
      case 'fixed_shift': {
        const empId = rule.rule_config?.employee_id
        const shift = rule.rule_config?.shift
        if (empId && (shift === 'morning' || shift === 'evening')) {
          fixedShifts[empId] = shift
        }
        break
      }
    }
  }

  // Track shift counts for balanced mode
  const shiftCount: Record<string, { morning: number; evening: number }> = {}
  for (const emp of employees) {
    shiftCount[emp.id] = { morning: 0, evening: 0 }
  }

  const isUnavailable = (empId: string, dateStr: string): boolean => {
    return unavailableMap.has(`${empId}_${dateStr}`)
  }

  const canAssignTogether = (a: string, b: string): boolean => {
    return !noSameShiftPairs.has(`${a}_${b}`)
  }

  const getSortedEmployees = (dateStr: string): typeof employees => {
    const available = employees.filter(e => !isUnavailable(e.id, dateStr))

    if (isBalanced) {
      // Sort by total shifts assigned so far (ascending)
      return available.sort((a, b) => {
        const aTotal = shiftCount[a.id].morning + shiftCount[a.id].evening
        const bTotal = shiftCount[b.id].morning + shiftCount[b.id].evening
        if (aTotal !== bTotal) return aTotal - bTotal
        // Priority employees come first if tied
        const aPri = priorityIds.has(a.id) ? 0 : 1
        const bPri = priorityIds.has(b.id) ? 0 : 1
        return aPri - bPri
      })
    }

    // Priority mode: priority employees first
    return available.sort((a, b) => {
      const aPri = priorityIds.has(a.id) ? 0 : 1
      const bPri = priorityIds.has(b.id) ? 0 : 1
      if (aPri !== bPri) return aPri - bPri
      // Also balance by count
      const aTotal = shiftCount[a.id].morning + shiftCount[a.id].evening
      const bTotal = shiftCount[b.id].morning + shiftCount[b.id].evening
      return aTotal - bTotal
    })
  }

  const pickEmployees = (
    count: number,
    candidates: typeof employees,
    excludeIds: Set<string>,
    dateStr: string
  ): string[] => {
    const picked: string[] = []

    for (const emp of candidates) {
      if (picked.length >= count) break
      if (excludeIds.has(emp.id)) continue

      // Check no_same_shift constraints with already picked
      let conflict = false
      for (const p of picked) {
        if (!canAssignTogether(emp.id, p)) {
          conflict = true
          break
        }
      }
      if (conflict) continue

      // Check fixed_shift constraints
      const fixedShift = fixedShifts[emp.id]
      if (fixedShift) {
        // If this employee has a fixed shift assigned, they'll be handled below
        // For now, allow picking for any shift
      }

      picked.push(emp.id)
    }

    // If not enough candidates, fill from remaining available employees
    if (picked.length < count) {
      for (const emp of candidates) {
        if (picked.length >= count) break
        if (excludeIds.has(emp.id) || picked.includes(emp.id)) continue
        picked.push(emp.id)
      }
    }

    return picked
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const sortedEmps = getSortedEmployees(dateStr)
    const candidateIds = new Set(sortedEmps.map(e => e.id))

    const morning: string[] = []
    const evening: string[] = []

    // Handle fixed shifts first
    const fixedMorningIds: string[] = []
    const fixedEveningIds: string[] = []
    for (const emp of sortedEmps) {
      const fixedShift = fixedShifts[emp.id]
      if (fixedShift === 'morning' && !isUnavailable(emp.id, dateStr)) {
        fixedMorningIds.push(emp.id)
      } else if (fixedShift === 'evening' && !isUnavailable(emp.id, dateStr)) {
        fixedEveningIds.push(emp.id)
      }
    }

    // Assign fixed shift employees
    for (const id of fixedMorningIds) {
      if (morning.length < morningCount) {
        morning.push(id)
      }
    }
    for (const id of fixedEveningIds) {
      if (evening.length < eveningCount) {
        evening.push(id)
      }
    }

    const assignedSet = new Set([...morning, ...evening])

    // Check no_same_shift for remaining assignments
    // Morning: pick from remaining candidates
    const morningCandidates = sortedEmps.filter(
      e => !assignedSet.has(e.id) && !isUnavailable(e.id, dateStr)
    )
    const pickedMorning = pickEmployees(
      morningCount - morning.length,
      morningCandidates,
      new Set([...morning, ...evening]),
      dateStr
    )
    morning.push(...pickedMorning)
    pickedMorning.forEach(id => assignedSet.add(id))

    // Evening: pick from remaining
    const eveningCandidates = sortedEmps.filter(
      e => !assignedSet.has(e.id) && !isUnavailable(e.id, dateStr)
    )
    const pickedEvening = pickEmployees(
      eveningCount - evening.length,
      eveningCandidates,
      assignedSet,
      dateStr
    )
    evening.push(...pickedEvening)
    pickedEvening.forEach(id => assignedSet.add(id))

    // Update shift counts
    for (const id of morning) {
      if (!shiftCount[id]) shiftCount[id] = { morning: 0, evening: 0 }
      shiftCount[id].morning++
    }
    for (const id of evening) {
      if (!shiftCount[id]) shiftCount[id] = { morning: 0, evening: 0 }
      shiftCount[id].evening++
    }

    result.push({ date: dateStr, morning, evening })
  }

  return result
}

// ========================================
// 格式化排班结果为纯文本
// ========================================

export function formatScheduleToText(
  assignments: ShiftAssignment[],
  employeeMap: Record<string, string>,
  year: number,
  month: number
): string {
  const monthName = `${year}年${month}月`
  const lines: string[] = []
  lines.push(`===== 排班表 (${monthName}) =====`)
  lines.push(`--- 生成時間: ${new Date().toLocaleString('zh-HK')} ---`)
  lines.push('')
  lines.push(`格式: 日期(星期) | 早: 員工姓名 | 晚: 員工姓名`)
  lines.push('')
  lines.push('─'.repeat(50))
  lines.push('')

  const dayNames = ['日', '一', '二', '三', '四', '五', '六']

  for (const a of assignments) {
    const d = new Date(a.date)
    const dayName = dayNames[d.getDay()]
    const dateStr = a.date.slice(5) // "MM-DD"

    const morningNames = a.morning.map(id => employeeMap[id] || id).join(', ')
    const eveningNames = a.evening.map(id => employeeMap[id] || id).join(', ')

    const morningStr = morningNames ? `早: ${morningNames}` : '早: -'
    const eveningStr = eveningNames ? `晚: ${eveningNames}` : '晚: -'

    lines.push(`${dateStr}(${dayName}) | ${morningStr} | ${eveningStr}`)
  }

  lines.push('')
  lines.push('─'.repeat(50))
  lines.push('')
  lines.push(`共 ${assignments.length} 天`)

  return lines.join('\n')
}

// ========================================
// 解析纯文本格式回到排班数据
// ========================================

export function parseScheduleFromText(text: string): ShiftAssignment[] {
  const result: ShiftAssignment[] = []
  const lines = text.split('\n')

  // Regex: "MM-DD(星) | 早: name1, name2 | 晚: name3, name4"
  // or: "MM/DD(星) | 早: name1 | 晚: name2"
  const linePattern = /^(\d{1,2})[-/](\d{1,2})\([日月一二三四五六]\)\s*\|\s*早:\s*(.*?)\s*\|\s*晚:\s*(.*)$/

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(linePattern)
    if (!match) continue

    const month = parseInt(match[1])
    const day = parseInt(match[2])
    const morningRaw = match[3].trim()
    const eveningRaw = match[4].trim()

    // Try to extract year from surrounding context (use current year as fallback)
    const yearMatch = text.match(/(\d{4})年/)
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const morning = morningRaw === '-' || !morningRaw ? [] : morningRaw.split(',').map(s => s.trim()).filter(Boolean)
    const evening = eveningRaw === '-' || !eveningRaw ? [] : eveningRaw.split(',').map(s => s.trim()).filter(Boolean)

    result.push({ date, morning, evening })
  }

  return result
}

// ========================================
// 将排班文本中的员工名称解析为ID
// ========================================

export function resolveNamesToIds(
  assignments: ShiftAssignment[],
  nameToId: Record<string, string>
): ShiftAssignment[] {
  return assignments.map(a => ({
    date: a.date,
    morning: a.morning.map(n => nameToId[n] || n),
    evening: a.evening.map(n => nameToId[n] || n),
  }))
}

// ========================================
// 将排班数据中的ID解析回名称（用于显示）
// ========================================

export function resolveIdsToNames(
  assignments: ShiftAssignment[],
  idToName: Record<string, string>
): { date: string; morning: string[]; evening: string[] }[] {
  return assignments.map(a => ({
    date: a.date,
    morning: a.morning.map(id => idToName[id] || id),
    evening: a.evening.map(id => idToName[id] || id),
  }))
}
