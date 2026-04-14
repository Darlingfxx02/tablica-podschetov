import XLSX from 'xlsx-js-style'
import type { ProjectEstimate, Role, Section, Task, SectionType } from '../types'

const ROLE_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
]

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

type Row = (string | number)[]

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return 0
  const cleaned = v.replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function cellText(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/**
 * Detects section type by the text of the section heading.
 * Order matters: more specific keywords go first.
 */
export function detectSectionType(name: string): SectionType {
  const s = name.toLowerCase()
  if (/соглас|правк/.test(s)) return 'approval'
  if (/адаптив/.test(s)) return 'adaptive'
  if (/прототип/.test(s)) return 'prototyping'
  if (/дизайн/.test(s)) return 'design'
  if (/проектир/.test(s)) return 'projecting'
  return 'custom'
}

/**
 * Parses an xlsx file produced by the exporter (or a compatible manual template)
 * and returns a ProjectEstimate. Block types are guessed from section headings.
 */
export function parseEstimateFromXlsx(data: ArrayBuffer, projectName?: string): ProjectEstimate {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Файл не содержит листов')
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('Не удалось прочитать лист')

  const rows = XLSX.utils.sheet_to_json<Row>(ws, {
    header: 1,
    raw: false,
    defval: '',
  })
  if (rows.length < 5) throw new Error('Файл пустой или не соответствует шаблону')

  // --- Roles -------------------------------------------------------------
  // Row 0: category names (starting from column 4, may be merged across roles).
  // Row 1: role titles (one per column starting from column 4).
  // Row 4: hourly rate row, columns 4+.
  const headerRow0 = rows[0] || []
  const headerRow1 = rows[1] || []
  const rateRow = rows[4] || []

  // Merges let us expand a category across its role columns.
  const merges = ws['!merges'] || []
  const categoryByCol: Record<number, string> = {}
  merges.forEach(m => {
    if (m.s.r === 0 && m.e.r === 0 && m.s.c >= 4) {
      const catName = cellText(headerRow0[m.s.c])
      for (let c = m.s.c; c <= m.e.c; c++) categoryByCol[c] = catName
    }
  })
  // Fill in single-column categories (not merged).
  for (let c = 4; c < headerRow0.length; c++) {
    if (categoryByCol[c] == null) {
      const catName = cellText(headerRow0[c])
      if (catName) categoryByCol[c] = catName
    }
  }

  const roles: Role[] = []
  const roleIdByCol: Record<number, string> = {}
  for (let c = 4; c < headerRow1.length; c++) {
    const title = cellText(headerRow1[c])
    if (!title) continue
    const id = generateId()
    roleIdByCol[c] = id
    roles.push({
      id,
      category: categoryByCol[c] || '',
      title,
      hourlyRate: toNumber(rateRow[c]),
      color: ROLE_COLORS[roles.length % ROLE_COLORS.length],
    })
  }

  // --- Sections ----------------------------------------------------------
  // Data section starts at row 5 (after the 3-row project totals block).
  const sections: Section[] = []
  const contactLines: string[] = []
  let inContact = false
  let current: { name: string; tasks: Task[] } | null = null

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || []
    const colA = cellText(row[0])
    const colB = cellText(row[1])

    // Contact info marker — finalize current section and switch mode.
    if (!inContact && /контактн/i.test(colB)) {
      if (current) {
        sections.push(finalizeSection(current, roles))
        current = null
      }
      inContact = true
      continue
    }
    if (inContact) {
      if (colB) contactLines.push(colB.replace(/^\s+/, ''))
      continue
    }

    // Section subtotal row — close current section.
    if (colB === 'Итог') {
      if (current) {
        sections.push(finalizeSection(current, roles))
        current = null
      }
      continue
    }

    // New section header — column A has a value.
    if (colA) {
      if (current) {
        sections.push(finalizeSection(current, roles))
      }
      current = { name: colA, tasks: [] }
      // This row also contains the first task (in column B).
      if (colB) {
        current.tasks.push(buildTask(colB, row, roleIdByCol))
      }
      continue
    }

    // Task row within a section.
    if (current && colB) {
      current.tasks.push(buildTask(colB, row, roleIdByCol))
    }
  }

  if (current) sections.push(finalizeSection(current, roles))

  // --- Auto-link projecting pairs ---------------------------------------
  // "Проектирование" immediately followed by "Дизайн" or "Прототипирование"
  // → link them via linkedGroupId.
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]
    const b = sections[i + 1]
    if (a.sectionType === 'projecting' && (b.sectionType === 'design' || b.sectionType === 'prototyping')) {
      const groupId = generateId()
      a.linkedGroupId = groupId
      b.linkedGroupId = groupId
      const minLen = Math.min(a.tasks.length, b.tasks.length)
      for (let t = 0; t < minLen; t++) {
        const linkId = generateId()
        a.tasks[t].linkId = linkId
        b.tasks[t].linkId = linkId
      }
    }
  }

  return {
    projectName: projectName || 'Импортированный проект',
    roles,
    sections,
    contact: { lines: contactLines },
  }
}

function buildTask(cellB: string, row: Row, roleIdByCol: Record<number, string>): Task {
  // B cell format: "title\n\ndescription" (double newline) — fall back to single newline.
  let title = cellB
  let description = ''
  const dbl = cellB.indexOf('\n\n')
  if (dbl >= 0) {
    title = cellB.slice(0, dbl).trim()
    description = cellB.slice(dbl + 2).trim()
  } else {
    const nl = cellB.indexOf('\n')
    if (nl >= 0) {
      title = cellB.slice(0, nl).trim()
      description = cellB.slice(nl + 1).trim()
    }
  }

  const hours: Record<string, number> = {}
  Object.entries(roleIdByCol).forEach(([colStr, roleId]) => {
    const col = Number(colStr)
    const h = toNumber(row[col])
    if (h) hours[roleId] = h
  })

  const isDivider = !description && Object.keys(hours).length === 0

  return { id: generateId(), title, description, hours, ...(isDivider ? { isDivider: true } : {}) }
}

function finalizeSection(
  draft: { name: string; tasks: Task[] },
  _roles: Role[],
): Section {
  void _roles
  const type = detectSectionType(draft.name)
  const section: Section = {
    id: generateId(),
    name: draft.name,
    sectionType: type,
    tasks: draft.tasks,
  }
  if (type === 'adaptive') section.breakpoints = []
  return section
}
