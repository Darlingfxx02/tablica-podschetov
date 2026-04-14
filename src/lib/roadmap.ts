import type { ProjectEstimate, RoadmapSettings, Section } from '../types'
import { taskTotalHours } from './calculations'

export interface RoadmapRow {
  id: string
  type: 'section-header' | 'feature-header' | 'task' | 'approval'
  sectionName: string
  featureName?: string
  taskName: string
  description: string
  hours: number
  startDate: Date | null
  endDate: Date | null
  note: string
  sourceSectionId?: string
  sourceTaskId?: string
  approvalAnchorDate?: Date | null
  overrideStartDate?: Date | null
  overrideEndDate?: Date | null
}

export interface RoadmapMonth {
  label: string
  days: Date[]
}

export interface RoadmapRowDescriptor {
  id: string
  type: RoadmapRow['type']
  sectionName: string
  featureName?: string
  taskName: string
  description: string
  note: string
  cachedHours: number
  cachedStartDate: Date | null
  cachedEndDate: Date | null
  sourceSectionId?: string
  sourceTaskId?: string
  approvalAnchorDate?: Date | null
  overrideStartDate?: Date | null
  overrideEndDate?: Date | null
}

const DEFAULT_SETTINGS: RoadmapSettings = {
  startDate: new Date().toISOString().slice(0, 10),
  hoursPerDay: 8,
  skipWeekends: true,
  skipHolidays: false,
  smallTaskThreshold: 80,
  approvalPercent: 25,
  approvalMode: 'after-task',
  approvalWeekday: 5,
  grouping: 'by-phase',
  showDisclaimer: true,
}

/**
 * Государственные праздники РФ (фиксированные даты).
 * Формат: MM-DD
 */
const RU_HOLIDAYS: string[] = [
  '01-01', // Новогодние каникулы
  '01-02',
  '01-03',
  '01-04',
  '01-05',
  '01-06',
  '01-07', // Рождество Христово
  '01-08',
  '02-23', // День защитника Отечества
  '03-08', // Международный женский день
  '05-01', // Праздник Весны и Труда
  '05-09', // День Победы
  '06-12', // День России
  '11-04', // День народного единства
]

export function isHoliday(date: Date): boolean {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return RU_HOLIDAYS.includes(`${mm}-${dd}`)
}

export function getSettings(s?: RoadmapSettings): RoadmapSettings {
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS
}

function isWorkDay(d: Date, skipWeekends: boolean, skipHolidays: boolean = false): boolean {
  if (skipWeekends && (d.getDay() === 0 || d.getDay() === 6)) return false
  if (skipHolidays && isHoliday(d)) return false
  return true
}

function nextWorkDay(d: Date, skipWeekends: boolean, skipHolidays: boolean = false): Date {
  const next = new Date(d)
  while (!isWorkDay(next, skipWeekends, skipHolidays)) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

function nextWorkDayAfter(d: Date, skipWeekends: boolean, skipHolidays: boolean = false): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  return nextWorkDay(next, skipWeekends, skipHolidays)
}

function formatDateRu(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildApprovalAllocations(totalHours: number, taskCount: number): number[] {
  const roundedTotal = Math.max(0, Math.round(totalHours))
  if (taskCount <= 0 || roundedTotal <= 0) return []

  let distributed = 0
  return Array.from({ length: taskCount }, (_, index) => {
    const targetDistributed = Math.round(((index + 1) * roundedTotal) / taskCount)
    const allocation = Math.max(0, targetDistributed - distributed)
    distributed += allocation
    return allocation
  })
}

export function generateRoadmap(estimate: ProjectEstimate): { rows: RoadmapRow[]; months: RoadmapMonth[] } {
  const settings = getSettings(estimate.roadmapSettings)
  const rows: RoadmapRow[] = []
  const overrides = settings.dateOverrides || {}

  // --- Approval hours from approval section(s) ---
  const approvalSections = estimate.sections.filter(s => s.sectionType === 'approval')
  const totalApprovalHours = approvalSections.reduce((sum, s) =>
    sum + s.tasks.reduce((ts, t) => ts + taskTotalHours(t), 0), 0)
  const hasApprovals = totalApprovalHours > 0
  const totalTaskCount = estimate.sections
    .filter(s => s.sectionType !== 'approval')
    .reduce((sum, s) => sum + s.tasks.filter(t => !t.isDivider && taskTotalHours(t) > 0).length, 0)

  const approvalMode = settings.approvalMode ?? 'after-task'
  const approvalAllocations = buildApprovalAllocations(totalApprovalHours, totalTaskCount)
  let approvalAllocationIndex = 0
  let pendingApprovalHours = 0

  // --- Threshold for stacking small tasks on the same day ---
  const thresholdPct = settings.smallTaskThreshold ?? 80
  const SMALL_TASK_THRESHOLD = settings.hoursPerDay * (thresholdPct / 100)

  // --- Cursor: tracks current date AND hours already used on that date ---
  let cursorDate = nextWorkDay(new Date(settings.startDate + 'T00:00:00'), settings.skipWeekends, settings.skipHolidays)
  let cursorHoursUsed = 0
  let cursorHasApprovalReservation = false

  // Small-task grouping state
  let smallGroupTaskCount = 0
  let groupEndDate: Date | null = null
  let lastGroupSectionName = ''

  // Approval tracking (all modes)
  let tasksSinceLastApproval = 0
  let lastTaskEndDate: Date | null = null
  let lastTaskSectionName = ''

  // Weekly mode: next approval date
  let nextWeeklyDate: Date | null = null
  if (hasApprovals && approvalMode === 'weekly') {
    const weekday = settings.approvalWeekday ?? 5
    const d = new Date(cursorDate)
    while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
    nextWeeklyDate = d
  }

  function makeRowId(sectionId: string, taskId: string, suffix: string): string {
    return `${sectionId}_${taskId}_${suffix}`
  }

  function consumeApprovalHoursForTask(): number {
    const hours = approvalAllocations[approvalAllocationIndex] ?? 0
    approvalAllocationIndex += 1
    pendingApprovalHours += hours
    return hours
  }

  function advanceCursorToNextDay() {
    cursorDate = nextWorkDay(new Date(cursorDate.getTime() + 86400000), settings.skipWeekends, settings.skipHolidays)
    cursorHoursUsed = 0
    cursorHasApprovalReservation = false
  }

  function moveCursorToDate(targetDate: Date) {
    const targetIso = toISODate(targetDate)
    const cursorIso = toISODate(cursorDate)
    if (cursorIso < targetIso) {
      cursorDate = new Date(targetDate)
      cursorHoursUsed = 0
      cursorHasApprovalReservation = false
    }
  }

  function reserveHoursFromDate(startFrom: Date, hours: number): { start: Date; end: Date } {
    moveCursorToDate(startFrom)

    let remaining = hours
    let start: Date | null = null
    let end = new Date(cursorDate)

    while (remaining > 0) {
      if (cursorHoursUsed >= settings.hoursPerDay) advanceCursorToNextDay()

      if (!start) start = new Date(cursorDate)

      const availableToday = settings.hoursPerDay - cursorHoursUsed
      const consumedToday = Math.min(availableToday, remaining)
      cursorHoursUsed += consumedToday
      remaining -= consumedToday
      end = new Date(cursorDate)

      if (remaining > 0) advanceCursorToNextDay()
    }

    return { start: start || new Date(cursorDate), end }
  }

  function emitApprovalRow(onDate: Date, sectionName: string, extraHours?: number) {
    if (!hasApprovals) return
    const hours = Math.round(extraHours ?? pendingApprovalHours)
    if (hours <= 0) return

    const approvalDate = nextWorkDay(new Date(onDate), settings.skipWeekends, settings.skipHolidays)
    const allocation = reserveHoursFromDate(approvalDate, hours)

    rows.push({
      id: `approval_${rows.length}`,
      type: 'approval',
      sectionName,
      taskName: 'Созвон и правки',
      description: '',
      hours,
      startDate: allocation.start,
      endDate: allocation.end,
      note: '',
      approvalAnchorDate: approvalDate,
    })
    tasksSinceLastApproval = 0
    pendingApprovalHours = 0
    cursorHasApprovalReservation = true
  }

  /**
   * For block approvals we reserve time on the next working day after the block
   * is finished, so follow-up work can continue later that same day.
   */
  function emitNextDayBlockApproval(afterDate: Date, sectionName: string, extraHours?: number) {
    if (!hasApprovals) return
    const hours = Math.round(extraHours ?? pendingApprovalHours)
    if (hours <= 0) return

    const approvalDate = nextWorkDayAfter(afterDate, settings.skipWeekends, settings.skipHolidays)
    const allocation = reserveHoursFromDate(approvalDate, hours)

    rows.push({
      id: `approval_${rows.length}`,
      type: 'approval',
      sectionName,
      taskName: 'Созвон и правки',
      description: '',
      hours,
      startDate: allocation.start,
      endDate: allocation.end,
      note: '',
      approvalAnchorDate: approvalDate,
    })
    tasksSinceLastApproval = 0
    pendingApprovalHours = 0
    cursorHasApprovalReservation = true
  }

  /** For weekly mode: emit approval if cursor has passed the next weekly date */
  function checkWeeklyApproval() {
    if (approvalMode !== 'weekly' || !nextWeeklyDate || !hasApprovals) return
    while (nextWeeklyDate && cursorDate >= nextWeeklyDate) {
      if (tasksSinceLastApproval > 0) {
        emitApprovalRow(nextWeeklyDate, lastTaskSectionName)
      }
      const nextDate: Date = new Date(nextWeeklyDate)
      nextDate.setDate(nextDate.getDate() + 7)
      nextWeeklyDate = nextDate
    }
  }

  /** For after-block mode: emit approval at block boundary */
  function emitBlockBoundaryApproval() {
    if (approvalMode !== 'after-block' || !hasApprovals) return
    if (tasksSinceLastApproval > 0 && lastTaskEndDate) {
      emitNextDayBlockApproval(lastTaskEndDate, lastTaskSectionName)
    }
  }

  function flushSmallTaskGroup() {
    if (smallGroupTaskCount === 0 || !groupEndDate) return

    // For after-task mode: emit grouped approval on the last day of the group
    if (approvalMode === 'after-task' && hasApprovals) {
      emitApprovalRow(groupEndDate, lastGroupSectionName)
    }

    smallGroupTaskCount = 0
    groupEndDate = null
  }

  function emitTaskRow(
    section: Section,
    taskId: string,
    phaseName: string,
    description: string,
    hours: number,
  ) {
    const taskRowId = makeRowId(section.id, taskId, phaseName)
    const taskOverride = overrides[taskRowId]

    // Small task: can share a day with other items
    if (hours < SMALL_TASK_THRESHOLD && !taskOverride?.startDate && !taskOverride?.endDate) {
      let taskStart: Date
      let taskEnd: Date

      if (cursorHoursUsed + hours <= settings.hoursPerDay) {
        taskStart = new Date(cursorDate)
        taskEnd = new Date(cursorDate)
        cursorHoursUsed += hours
      } else {
        advanceCursorToNextDay()
        taskStart = new Date(cursorDate)
        taskEnd = new Date(cursorDate)
        cursorHoursUsed = hours
      }

      groupEndDate = new Date(cursorDate)
      smallGroupTaskCount++
      lastGroupSectionName = section.name
      consumeApprovalHoursForTask()
      tasksSinceLastApproval++
      lastTaskEndDate = new Date(cursorDate)
      lastTaskSectionName = section.name

      rows.push({
        id: taskRowId,
        type: 'task',
        sectionName: section.name,
        taskName: phaseName,
        description,
        hours,
        startDate: taskStart,
        endDate: taskEnd,
        note: '',
        sourceSectionId: section.id,
        sourceTaskId: taskId,
        overrideStartDate: taskOverride?.startDate ? new Date(taskOverride.startDate + 'T00:00:00') : null,
        overrideEndDate: taskOverride?.endDate ? new Date(taskOverride.endDate + 'T00:00:00') : null,
      })

      cursorHasApprovalReservation = false
      checkWeeklyApproval()
      return
    }

    // Big task (or overridden): flush any accumulated small tasks first
    flushSmallTaskGroup()

    const daysNeeded = Math.max(1, Math.ceil(hours / settings.hoursPerDay))

    let start: Date
    let end: Date
    if (taskOverride?.startDate) {
      start = nextWorkDay(new Date(taskOverride.startDate + 'T00:00:00'), settings.skipWeekends, settings.skipHolidays)
    } else {
      if (cursorHoursUsed > 0 && !cursorHasApprovalReservation) advanceCursorToNextDay()
      start = new Date(cursorDate)
    }
    if (taskOverride?.endDate) {
      end = new Date(taskOverride.endDate + 'T00:00:00')
    } else {
      const allocation = reserveHoursFromDate(start, hours)
      start = allocation.start
      end = allocation.end
    }

    rows.push({
      id: taskRowId,
      type: 'task',
      sectionName: section.name,
      taskName: phaseName,
      description,
      hours,
      startDate: start,
      endDate: end,
      note: '',
      sourceSectionId: section.id,
      sourceTaskId: taskId,
      overrideStartDate: taskOverride?.startDate ? new Date(taskOverride.startDate + 'T00:00:00') : null,
      overrideEndDate: taskOverride?.endDate ? new Date(taskOverride.endDate + 'T00:00:00') : null,
    })

    // Update cursor to end of task
    if (taskOverride?.endDate) {
      cursorDate = new Date(end)
      const hoursOnLastDay = hours - (daysNeeded - 1) * settings.hoursPerDay
      cursorHoursUsed = hoursOnLastDay > 0 ? hoursOnLastDay : settings.hoursPerDay
    }
    cursorHasApprovalReservation = false

    consumeApprovalHoursForTask()
    tasksSinceLastApproval++
    lastTaskEndDate = new Date(end)
    lastTaskSectionName = section.name

    // after-task mode: approval on the task's end date (no cursor advance)
    if (approvalMode === 'after-task' && hasApprovals) {
      emitApprovalRow(end, section.name)
    }

    checkWeeklyApproval()
  }

  if (settings.grouping === 'by-section') {
    generateBySection(estimate, rows, emitTaskRow, flushSmallTaskGroup, emitBlockBoundaryApproval)
  } else {
    generateByPhase(estimate, rows, emitTaskRow, flushSmallTaskGroup, emitBlockBoundaryApproval)
  }

  // Flush remaining small tasks and any trailing approval
  flushSmallTaskGroup()
  if (approvalMode === 'after-block') emitBlockBoundaryApproval()
  if (approvalMode === 'weekly') {
    // Emit approval for any remaining tasks after the last weekly date
    if (tasksSinceLastApproval > 0 && lastTaskEndDate) {
      emitApprovalRow(lastTaskEndDate, lastTaskSectionName)
    }
  }

  const months = generateMonthGrid(rows)
  return { rows, months }
}

export function generateRoadmapExportModel(estimate: ProjectEstimate): {
  rows: RoadmapRow[]
  months: RoadmapMonth[]
  descriptors: RoadmapRowDescriptor[]
} {
  const { rows, months } = generateRoadmap(estimate)

  const descriptors = rows.map(row => ({
    id: row.id,
    type: row.type,
    sectionName: row.sectionName,
    featureName: row.featureName,
    taskName: row.taskName,
    description: row.description,
    note: row.note,
    cachedHours: row.hours,
    cachedStartDate: row.startDate,
    cachedEndDate: row.endDate,
    sourceSectionId: row.sourceSectionId,
    sourceTaskId: row.sourceTaskId,
    approvalAnchorDate: row.approvalAnchorDate,
    overrideStartDate: row.overrideStartDate,
    overrideEndDate: row.overrideEndDate,
  }))

  return { rows, months, descriptors }
}

function getRoadmapTaskDisplay(section: Section, taskTitle: string, taskDescription: string, fallbackLabel: string): {
  label: string
  description: string
} {
  if (section.sectionType === 'adaptive') {
    return {
      label: taskTitle || fallbackLabel,
      description: taskDescription || '',
    }
  }

  return {
    label: fallbackLabel,
    description: taskDescription || taskTitle,
  }
}

function generateByPhase(
  estimate: ProjectEstimate,
  rows: RoadmapRow[],
  emitTaskRow: (section: Section, taskId: string, phaseName: string, description: string, hours: number) => void,
  flushSmallTaskGroup: () => void,
  emitBlockBoundaryApproval: () => void,
) {
  const projectingSections = estimate.sections.filter(s => s.sectionType === 'projecting' || s.sectionType === 'prototyping')
  const designSections = estimate.sections.filter(s => s.sectionType === 'design')
  const customSections = estimate.sections.filter(s => s.sectionType === 'custom')
  const adaptiveSections = estimate.sections.filter(s => s.sectionType === 'adaptive')

  const allSectionGroups = [
    { phaseSections: projectingSections, phaseLabel: 'Проектирование' },
    { phaseSections: designSections, phaseLabel: 'Дизайн' },
    { phaseSections: customSections, phaseLabel: '' },
    { phaseSections: adaptiveSections, phaseLabel: 'Адаптивы' },
    // approval sections не рендерятся отдельной фазой — согласование уже
    // встроено в таймлайн жёлтыми ячейками после каждой задачи
  ]

  for (const { phaseSections, phaseLabel } of allSectionGroups) {
    if (phaseSections.length === 0) continue

    flushSmallTaskGroup()
    emitBlockBoundaryApproval()

    rows.push({
      id: `header_${phaseLabel || phaseSections[0].id}`,
      type: 'section-header',
      sectionName: phaseLabel || phaseSections[0].name,
      taskName: phaseLabel || phaseSections[0].name,
      description: '',
      hours: 0,
      startDate: null,
      endDate: null,
      note: '',
    })

    for (const section of phaseSections) {
      for (const task of section.tasks) {
        if (task.isDivider) {
          flushSmallTaskGroup()
          emitBlockBoundaryApproval()
          rows.push({
            id: `feature_byphase_${section.id}_${task.id}`,
            type: 'feature-header',
            sectionName: phaseLabel || section.name,
            featureName: task.title,
            taskName: task.title || 'Название группы',
            description: '',
            hours: 0,
            startDate: null,
            endDate: null,
            note: '',
          })
          continue
        }

        const hours = taskTotalHours(task)
        if (hours === 0) continue

        const display = getRoadmapTaskDisplay(
          section,
          task.title,
          task.description,
          task.title || phaseLabel || section.name,
        )
        emitTaskRow(section, task.id, display.label, display.description, hours)
      }
    }
  }
}

function generateBySection(
  estimate: ProjectEstimate,
  rows: RoadmapRow[],
  emitTaskRow: (section: Section, taskId: string, phaseName: string, description: string, hours: number) => void,
  flushSmallTaskGroup: () => void,
  emitBlockBoundaryApproval: () => void,
) {
  // Group linked sections together so we process a linked pair as one unit
  const processed = new Set<string>()

  for (const section of estimate.sections) {
    if (processed.has(section.id)) continue
    if (section.sectionType === 'approval') continue // согласование уже встроено жёлтыми ячейками
    processed.add(section.id)

    // Find linked partner section
    const linkedSections: Section[] = [section]
    if (section.linkedGroupId) {
      const partners = estimate.sections.filter(
        s => s.id !== section.id && s.linkedGroupId === section.linkedGroupId
      )
      for (const p of partners) {
        if (!processed.has(p.id)) {
          linkedSections.push(p)
          processed.add(p.id)
        }
      }
    }

    // For non-linked sections (custom, adaptive, approval) — show as before
    if (linkedSections.length === 1 && !section.linkedGroupId) {
      flushSmallTaskGroup()
      emitBlockBoundaryApproval()

      rows.push({
        id: `header_section_${section.id}`,
        type: 'section-header',
        sectionName: section.name,
        taskName: section.name,
        description: '',
        hours: 0,
        startDate: null,
        endDate: null,
        note: '',
      })

      for (const task of section.tasks) {
        if (task.isDivider) {
          flushSmallTaskGroup()
          emitBlockBoundaryApproval()
          rows.push({
            id: `feature_bysec_${section.id}_${task.id}`,
            type: 'feature-header',
            sectionName: section.name,
            featureName: task.title,
            taskName: task.title || 'Название группы',
            description: '',
            hours: 0,
            startDate: null,
            endDate: null,
            note: '',
          })
          continue
        }

        const hours = taskTotalHours(task)
        if (hours === 0) continue

        const display = getRoadmapTaskDisplay(
          section,
          task.title,
          task.description,
          getPhaseName(section),
        )
        emitTaskRow(section, task.id, display.label, display.description, hours)
      }
      continue
    }

    // For linked sections: group by task (feature name as header),
    // then show phases (Проектирование, Дизайн, Согласование) under each
      const primarySection = linkedSections[0]
      const detailSectionId = primarySection.id

      for (const task of primarySection.tasks) {
        if (task.isDivider) {
          flushSmallTaskGroup()
          emitBlockBoundaryApproval()
          rows.push({
            id: `feature_bysec_divider_${section.id}_${task.id}`,
            type: 'feature-header',
            sectionName: task.title,
            featureName: task.title,
            taskName: task.title || 'Название группы',
            description: '',
            hours: 0,
            startDate: null,
            endDate: null,
            note: '',
          })
          continue
        }

      // Use the task title as the bold section header
      const featureName = task.title || 'Название раздела'

      // Check if any linked section has hours for this task
      let hasAnyHours = false
      for (const ls of linkedSections) {
        let matchingTask = task
        if (ls.id !== primarySection.id) {
          const linked = ls.tasks.find(t => t.linkId && t.linkId === task.linkId)
          if (linked) matchingTask = linked
        }
        if (taskTotalHours(matchingTask) > 0) {
          hasAnyHours = true
          break
        }
      }
      if (!hasAnyHours) continue

      // Emit bold feature header (e.g. "Главная")
      flushSmallTaskGroup()
      emitBlockBoundaryApproval()
      rows.push({
        id: `header_section_${section.id}_${task.id}`,
        type: 'section-header',
        sectionName: featureName,
        taskName: featureName,
        description: '',
        hours: 0,
        startDate: null,
        endDate: null,
        note: '',
      })

      // Emit phase rows under this feature
      for (const ls of linkedSections) {
        let matchingTask = task
        if (ls.id !== primarySection.id) {
          const linked = ls.tasks.find(t => t.linkId && t.linkId === task.linkId)
          if (linked) {
            matchingTask = linked
          } else {
            const primaryIdx = primarySection.tasks.filter(t => !t.isDivider).indexOf(task)
            const candidates = ls.tasks.filter(t => !t.isDivider)
            if (primaryIdx >= 0 && primaryIdx < candidates.length) {
              matchingTask = candidates[primaryIdx]
            }
          }
        }

        const taskHours = taskTotalHours(matchingTask)
        if (taskHours === 0) continue

        const phaseName = getPhaseName(ls)
        const description = ls.id === detailSectionId
          ? (matchingTask.description || matchingTask.title)
          : ''
        emitTaskRow(ls, matchingTask.id, phaseName, description, taskHours)
      }
    }
  }
}

function getPhaseName(section: Section): string {
  switch (section.sectionType) {
    case 'projecting': return 'Проектирование'
    case 'prototyping': return 'Проектирование'
    case 'design': return 'Дизайн'
    case 'adaptive': return 'Адаптивы'
    case 'approval': return 'Согласование'
    default: return section.name
  }
}

function generateMonthGrid(rows: RoadmapRow[]): RoadmapMonth[] {
  let minDate: Date | null = null
  let maxDate: Date | null = null
  for (const r of rows) {
    if (r.startDate && (!minDate || r.startDate < minDate)) minDate = r.startDate
    if (r.endDate && (!maxDate || r.endDate > maxDate)) maxDate = r.endDate
  }
  if (!minDate || !maxDate) return []

  const start = new Date(minDate)
  const end = new Date(maxDate)
  end.setDate(end.getDate() + 3)

  const monthsMap = new Map<string, Date[]>()
  const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ]

  const d = new Date(start)
  while (d <= end) {
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
    if (!monthsMap.has(key)) monthsMap.set(key, [])
    monthsMap.get(key)!.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }

  return Array.from(monthsMap.entries()).map(([label, days]) => ({ label, days }))
}

export function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6
}

export function isDateInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  const d = date.getTime()
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  return d >= s && d <= e
}

export function formatDateShort(d: Date): string {
  return formatDateRu(d)
}

export function toISODateStr(d: Date): string {
  return toISODate(d)
}
