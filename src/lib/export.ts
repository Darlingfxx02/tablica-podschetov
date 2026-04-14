import XLSX from 'xlsx-js-style'
import JSZip from 'jszip'
import type { ProjectEstimate } from '../types'
import {
  taskTotalHours, taskCost, sectionTotalHours, sectionTotalCost,
  sectionRoleHours, grandTotalHours, grandTotalCost, totalRoleHours,
} from './calculations'
import { getContactLines, isContactUrl } from '../store'
import {
  generateRoadmapExportModel,
  getSettings,
  isWeekend,
  isHoliday,
  type RoadmapMonth,
  type RoadmapRow,
  type RoadmapRowDescriptor,
} from './roadmap'

const FONT = { name: 'Onest', sz: 10 }
const FONT_SMALL = { ...FONT, sz: 9 }
const FONT_DISCLAIMER = { ...FONT, sz: 11 }
const FONT_BOLD = { ...FONT, bold: true }
const FONT_BOLD_LG = { ...FONT, bold: true, sz: 14 }

const DARK_BG = { fgColor: { rgb: '202020' } }
const GRAY_BG = { fgColor: { rgb: 'D9D9D9' } }
const PURPLE_BG = { fgColor: { rgb: 'D9D2E9' } }
const EVEN_BG = { fgColor: { rgb: 'F3F3F3' } }
const WHITE_BG = { fgColor: { rgb: 'FFFFFF' } }

const WHITE_FONT = { ...FONT, color: { rgb: 'FFFFFF' } }
const PURPLE_FONT = { ...FONT_SMALL, color: { rgb: 'D9D2E9' } }
const MUTED_FONT = { ...FONT_SMALL, color: { rgb: '666666' } }
const MUTED_FONT_BOLD = { ...FONT_SMALL, color: { rgb: '7B8190' }, bold: true }
const DARK_FONT_BOLD = { ...FONT, bold: true, color: { rgb: '202020' }, sz: 11 }

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'E0E0E0' } },
  bottom: { style: 'thin', color: { rgb: 'E0E0E0' } },
  left: { style: 'thin', color: { rgb: 'E0E0E0' } },
  right: { style: 'thin', color: { rgb: 'E0E0E0' } },
} as const

// Borders on dark-fill cells must match the dark fill, otherwise the default
// light-gray gridlines show through as near-white dividers on top of the
// black header/contact blocks. Every DARK_BG cell must pair with DARK_BORDER.
const DARK_BORDER = {
  top: { style: 'thin', color: { rgb: '202020' } },
  bottom: { style: 'thin', color: { rgb: '202020' } },
  left: { style: 'thin', color: { rgb: '202020' } },
  right: { style: 'thin', color: { rgb: '202020' } },
} as const

const CENTER = { horizontal: 'center', vertical: 'center', wrapText: true } as const
const BOTTOM = { vertical: 'bottom', wrapText: true } as const
// First block cells: text anchored top-left, numerics bottom-right, inside a
// row tall enough for 7 lines of detailed description.
const TOP_LEFT = { vertical: 'top', horizontal: 'left', wrapText: true } as const
const BOTTOM_RIGHT = { vertical: 'bottom', horizontal: 'right', wrapText: true } as const
// 7 text lines at 10pt (default row height 15pt per line) = 105pt.
const FIRST_BLOCK_ROW_HPT = 105
const NUM_FMT = '#,##0'

function cell(v: string | number, s: Record<string, unknown> = {}) {
  const t = typeof v === 'number' ? 'n' : 's'
  return { v, t, s: { border: BORDER_THIN, ...s } }
}

function formulaCell(
  v: string | number,
  f: string,
  s: Record<string, unknown> = {},
  t?: 'n' | 's',
) {
  return {
    v,
    f,
    t: t ?? (typeof v === 'number' ? 'n' : 's'),
    s: { border: BORDER_THIN, ...s },
  }
}

function excelDateSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const excelEpoch = Date.UTC(1899, 11, 30)
  return Math.floor((utc - excelEpoch) / 86400000)
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function sheetRef(sheetName: string, ref: string): string {
  return `${quoteSheetName(sheetName)}!${ref}`
}

function formulaLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '""'
  if (typeof value === 'number') return String(value)
  return `"${value.replace(/"/g, '""')}"`
}

function sumFormula(refs: string[]): string {
  if (refs.length === 0) return '0'
  if (refs.length === 1) return refs[0]
  return `SUM(${refs.join(',')})`
}

function injectWorkbookCalcPr(xml: string): string {
  const calcPr = '<calcPr calcId="171027" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'
  if (xml.includes('<calcPr')) {
    return xml.replace(/<calcPr[^>]*\/>/, calcPr)
  }
  return xml.replace('</workbook>', `${calcPr}</workbook>`)
}

interface ExportDownloadOptions {
  downloadWindow?: Window | null
}

function triggerDownload(filename: string, blob: Blob, options: ExportDownloadOptions = {}) {
  const url = URL.createObjectURL(blob)
  const { downloadWindow } = options

  if (downloadWindow && !downloadWindow.closed) {
    downloadWindow.location.href = url

    // Browsers that require a synchronous user gesture to initiate download
    // can reuse this already-opened window after the workbook finishes
    // generating, so keep the object URL alive longer than the anchor path.
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      if (!downloadWindow.closed) downloadWindow.close()
    }, 30000)
    return
  }

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  // Keep the link alive briefly so browsers that start downloads
  // asynchronously do not lose the object URL before the transfer begins.
  window.setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

interface EstimateSheetRefs {
  taskHoursByTaskId: Map<string, string>
  approvalHourRefs: string[]
}

// Cells that need rich text post-processing: the task title must be bold
// while the description stays regular, inside the same cell. xlsx-js-style
// can't write rich text, so we patch the generated sheet XML below.
interface RichTextCell {
  ref: string        // e.g. "B5"
  bold: string       // the task title
  rest: string       // the rest of the cell text, including leading "\n\n"
}

export async function exportToXlsx(
  estimate: ProjectEstimate,
  options: ExportDownloadOptions = {},
) {
  const { roles, sections, contact } = estimate
  const colCount = 5 + roles.length // A, B, C, D, + role columns + trailing decorative column
  const ws: Record<string, unknown> = {}
  const merges: XLSX.Range[] = []
  const richTextCells: RichTextCell[] = []
  const separatorRows: number[] = []
  const estimateRefs: EstimateSheetRefs = {
    taskHoursByTaskId: new Map(),
    approvalHourRefs: [],
  }
  let row = 0

  function setCell(r: number, c: number, val: unknown) {
    const ref = XLSX.utils.encode_cell({ r, c })
    ws[ref] = val
  }

  function colLetter(c: number) {
    return XLSX.utils.encode_col(c)
  }

  const estimateSheetName = 'Оценка'
  const summaryRow = 2
  const hoursSummaryRow = 3
  const rateRow = 4
  const firstDataRow = 5
  const roleStartCol = 4
  const roleEndCol = roleStartCol + roles.length - 1
  const roleStartLetter = colLetter(roleStartCol)
  const roleEndLetter = colLetter(roleEndCol)
  const rateRangeAbs = roles.length > 0
    ? `$${roleStartLetter}$${rateRow + 1}:$${roleEndLetter}$${rateRow + 1}`
    : ''

  // Row 0: Header row 1 — dark cells use DARK_BORDER so adjacent dark cells
  // merge visually into one continuous black strip (the reference look).
  const darkStyle = { fill: DARK_BG, font: WHITE_FONT, alignment: CENTER, border: DARK_BORDER }
  // A1:B2 merged (empty dark)
  setCell(0, 0, cell('', darkStyle))
  setCell(0, 1, cell('', darkStyle))
  setCell(1, 0, cell('', darkStyle))
  setCell(1, 1, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } })

  // C1:C2 merged "Всего часов"
  setCell(0, 2, cell('Всего часов', darkStyle))
  setCell(1, 2, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 2 }, e: { r: 1, c: 2 } })

  // D1:D2 merged "Стоимость"
  setCell(0, 3, cell('Стоимость', darkStyle))
  setCell(1, 3, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 3 }, e: { r: 1, c: 3 } })

  // Role category headers (row 0) — group by category
  const categories: { name: string; startCol: number; count: number }[] = []
  roles.forEach((role, i) => {
    const col = 4 + i
    const last = categories[categories.length - 1]
    if (last && last.name === role.category) {
      last.count++
    } else {
      categories.push({ name: role.category, startCol: col, count: 1 })
    }
  })
  categories.forEach(cat => {
    setCell(0, cat.startCol, cell(cat.name, darkStyle))
    if (cat.count > 1) {
      for (let i = 1; i < cat.count; i++) {
        setCell(0, cat.startCol + i, cell('', darkStyle))
      }
      merges.push({ s: { r: 0, c: cat.startCol }, e: { r: 0, c: cat.startCol + cat.count - 1 } })
    }
  })

  // Role title headers (row 1)
  roles.forEach((role, i) => {
    setCell(1, 4 + i, cell(role.title, { fill: DARK_BG, font: PURPLE_FONT, alignment: CENTER, border: DARK_BORDER }))
  })

  // Trailing decorative column — dark for header rows
  const trailCol = colCount - 1
  setCell(0, trailCol, cell('', darkStyle))
  setCell(1, trailCol, cell('', darkStyle))
  merges.push({ s: { r: 0, c: trailCol }, e: { r: 1, c: trailCol } })

  row = 2

  // Row 2: "Блок работ", "Задача / Раздел", grand totals
  // A3:A5 merged
  setCell(row, 0, cell('Блок работ', { font: MUTED_FONT }))
  setCell(row + 1, 0, cell('', { font: MUTED_FONT }))
  setCell(row + 2, 0, cell('', { font: MUTED_FONT }))
  merges.push({ s: { r: row, c: 0 }, e: { r: row + 2, c: 0 } })

  // B3:B5 merged
  setCell(row, 1, cell('Задача / Раздел', { font: MUTED_FONT, alignment: { wrapText: true } }))
  setCell(row + 1, 1, cell('', { font: MUTED_FONT }))
  setCell(row + 2, 1, cell('', { font: MUTED_FONT }))
  merges.push({ s: { r: row, c: 1 }, e: { r: row + 2, c: 1 } })

  // C3 — grand total hours. Single-row cell (NOT merged into C4/C5), so the
  // purple totals strip stays contained to row 3 across every column. C4 and
  // C5 are plain empty cells with the default white fill — this mirrors the
  // EstimateTable.tsx preview, where the Всего часов column drops out of
  // purple for the Кол-во часов / Ставка часа rows.
  const sectionTotalRows: number[] = []
  setCell(row, 2, cell(grandTotalHours(estimate), { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: '0' }))
  setCell(row + 1, 2, cell('', {}))
  setCell(row + 2, 2, cell('', {}))

  // D3: grand total cost
  setCell(row, 3, cell(grandTotalCost(estimate), { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: NUM_FMT }))

  // Role cost totals
  roles.forEach((role, i) => {
    setCell(row, 4 + i, cell(totalRoleHours(estimate, role.id) * role.hourlyRate, { fill: PURPLE_BG, font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT }))
  })
  // Trailing decorative column — purple for grand totals row
  setCell(row, trailCol, cell('', { fill: PURPLE_BG }))

  // Row 3: "Кол-во часов"
  row = 3
  setCell(row, 3, cell('Кол-во часов', { font: MUTED_FONT, alignment: { ...BOTTOM_RIGHT } }))
  roles.forEach((role, i) => {
    setCell(row, 4 + i, cell(totalRoleHours(estimate, role.id), { font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT }))
  })
  setCell(row, trailCol, cell('', {}))

  // Row 4: "Ставка часа"
  row = 4
  setCell(row, 3, cell('Ставка часа (руб.)', { font: MUTED_FONT, alignment: { ...BOTTOM_RIGHT } }))
  roles.forEach((role, i) => {
    setCell(row, 4 + i, cell(role.hourlyRate, { font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT }))
  })
  setCell(row, trailCol, cell('', {}))

  row = firstDataRow

  // Row indices that belong to the first detail block only — these get
  // custom row heights so each task has space for 7 lines of description.
  const detailBlockTaskRows: number[] = []

  // Sections
  sections.forEach((section, sIdx) => {
    // Numerics throughout the table are always pinned to the bottom-right.
    const numAlign = BOTTOM_RIGHT
    const sectionStartRow = row
    const taskCount = section.tasks.length

    // In a linked pair, the section that appears FIRST in the list shows
    // full details (bold title + description, tall rows, top-left alignment).
    // The second one shows only titles. Matches EstimateTable.tsx logic.
    const isHeaderOnly = (() => {
      if (!section.linkedGroupId || section.linkBroken) return false
      const siblingIdx = sections.findIndex(
        s => s.linkedGroupId === section.linkedGroupId && s.id !== section.id,
      )
      return siblingIdx !== -1 && siblingIdx < sIdx
    })()

    // Only the first section gets the tall 7-line detail treatment.
    const isDetailBlock = sIdx === 0 && !isHeaderOnly
    const textAlign = isDetailBlock ? TOP_LEFT : BOTTOM

    // Section name (merged across all task rows + subtotal)
    setCell(row, 0, cell(section.name, { fill: GRAY_BG, font: DARK_FONT_BOLD, alignment: { vertical: 'top', wrapText: true } }))
    if (taskCount > 0) {
      for (let i = 1; i <= taskCount; i++) {
        setCell(row + i, 0, cell('', { fill: GRAY_BG }))
      }
      merges.push({ s: { r: row, c: 0 }, e: { r: row + taskCount, c: 0 } })
    }

    // Tasks
    section.tasks.forEach((task, tIdx) => {
      if (task.isDivider) {
        // Divider row — gray strip spanning B..last column (matches section header column A)
        const dividerStyle = { fill: GRAY_BG, font: DARK_FONT_BOLD, alignment: { vertical: 'center' as const, wrapText: true }, border: BORDER_THIN }
        setCell(row, 1, cell(task.title || '', dividerStyle))
        for (let c = 2; c < colCount; c++) {
          setCell(row, c, cell('', dividerStyle))
        }
        merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } })
        row++
        return
      }

      const bg = tIdx % 2 === 0 ? WHITE_BG : EVEN_BG
      // Header-only sections suppress descriptions — show title only
      const showDescription = !isHeaderOnly && !!task.description
      const displayText = showDescription ? `${task.title}\n\n${task.description}` : task.title

      if (showDescription) {
        // Title + description: write as plain text, mark for rich-text
        // post-processing so only the title is bold.
        setCell(row, 1, cell(displayText, { fill: bg, font: FONT, alignment: { ...textAlign } }))
        richTextCells.push({
          ref: XLSX.utils.encode_cell({ r: row, c: 1 }),
          bold: task.title,
          rest: `\n\n${task.description}`,
        })
      } else {
        // No visible description — title only, regular weight.
        setCell(row, 1, cell(displayText, { fill: bg, font: FONT, alignment: { ...textAlign } }))
      }
      const excelRow = row + 1
      const roleRange = `${roleStartLetter}${excelRow}:${roleEndLetter}${excelRow}`
      const taskHoursCached = taskTotalHours(task)
      const taskCostCached = taskCost(task, roles)
      setCell(
        row,
        2,
        formulaCell(
          taskHoursCached || '',
          `IF(COUNT(${roleRange})=0,"",SUM(${roleRange}))`,
          { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: '0' },
        ),
      )
      setCell(
        row,
        3,
        formulaCell(
          taskCostCached || '',
          `IF(COUNT(${roleRange})=0,"",SUMPRODUCT(${roleRange},${rateRangeAbs}))`,
          { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: NUM_FMT },
        ),
      )
      estimateRefs.taskHoursByTaskId.set(task.id, sheetRef(estimateSheetName, `${colLetter(2)}${excelRow}`))
      roles.forEach((role, i) => {
        setCell(row, 4 + i, cell(task.hours[role.id] || '', { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: NUM_FMT }))
      })
      setCell(row, trailCol, cell('', { fill: bg }))
      if (isDetailBlock) detailBlockTaskRows.push(row)
      row++
    })

    // Subtotal row — label and all numerics pinned to the bottom-right.
    const subtotalExcelRow = row + 1
    const subtotalRoleRange = `${roleStartLetter}${subtotalExcelRow}:${roleEndLetter}${subtotalExcelRow}`
    const subtotalRoleRefs: string[] = []
    setCell(row, 1, cell('Итог', { fill: GRAY_BG, font: FONT_BOLD, alignment: { ...BOTTOM_RIGHT } }))
    roles.forEach((role, i) => {
      const h = sectionRoleHours(section, role.id)
      const roleRef = `${colLetter(4 + i)}${subtotalExcelRow}`
      subtotalRoleRefs.push(roleRef)
      setCell(
        row,
        4 + i,
        formulaCell(
          h || '',
          `SUM(${colLetter(4 + i)}${sectionStartRow + 1}:${colLetter(4 + i)}${subtotalExcelRow - 1})`,
          { fill: GRAY_BG, font: FONT_BOLD, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT },
        ),
      )
    })
    setCell(
      row,
      2,
      formulaCell(
        sectionTotalHours(section),
        `SUM(${subtotalRoleRange})`,
        { fill: GRAY_BG, font: FONT_BOLD, alignment: { ...BOTTOM_RIGHT }, numFmt: '0' },
      ),
    )
    setCell(
      row,
      3,
      formulaCell(
        sectionTotalCost(section, roles),
        `SUMPRODUCT(${subtotalRoleRange},${rateRangeAbs})`,
        { fill: GRAY_BG, font: FONT_BOLD, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT },
      ),
    )
    setCell(row, trailCol, cell('', { fill: GRAY_BG }))

    sectionTotalRows.push(row)
    if (section.sectionType === 'approval') {
      estimateRefs.approvalHourRefs.push(sheetRef(estimateSheetName, `${colLetter(2)}${subtotalExcelRow}`))
    }
    row++
    separatorRows.push(row)
    row++ // empty separator row
  })

  if (roles.length > 0) {
    const totalHoursRange = `${roleStartLetter}${hoursSummaryRow + 1}:${roleEndLetter}${hoursSummaryRow + 1}`
    const totalCostRange = `${roleStartLetter}${summaryRow + 1}:${roleEndLetter}${summaryRow + 1}`
    setCell(
      summaryRow,
      2,
      formulaCell(
        grandTotalHours(estimate),
        `SUM(${totalHoursRange})`,
        { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: '0' },
      ),
    )
    setCell(
      summaryRow,
      3,
      formulaCell(
        grandTotalCost(estimate),
        `SUM(${totalCostRange})`,
        { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: NUM_FMT },
      ),
    )
    roles.forEach((role, i) => {
      const roleCol = colLetter(4 + i)
      const subtotalRefs = sectionTotalRows.map(sectionRow => `${roleCol}${sectionRow + 1}`)
      setCell(
        hoursSummaryRow,
        4 + i,
        formulaCell(
          totalRoleHours(estimate, role.id),
          sumFormula(subtotalRefs),
          { font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT },
        ),
      )
      setCell(
        summaryRow,
        4 + i,
        formulaCell(
          totalRoleHours(estimate, role.id) * role.hourlyRate,
          `${roleCol}${hoursSummaryRow + 1}*$${roleCol}$${rateRow + 1}`,
          { fill: PURPLE_BG, font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT },
        ),
      )
    })
  }

  // Contact info — always rendered at the end
  {
    const contactLines = getContactLines(contact.lines)
    separatorRows.push(row)
    row++ // empty separator row
    const blockStartRow = row
    // Header row + one per line + one decorative trailing row that mirrors
    // the empty-styled row added in EstimateTable.tsx.
    const blockEndRow = row + contactLines.length + 1

    // Column A: dark block merged across all contact rows
    for (let r = blockStartRow; r <= blockEndRow; r++) {
      setCell(r, 0, cell('', { fill: DARK_BG, border: DARK_BORDER }))
    }
    merges.push({ s: { r: blockStartRow, c: 0 }, e: { r: blockEndRow, c: 0 } })

    // Header "Контактная информация" on dark background, spans B..last column
    setCell(
      row,
      1,
      cell('Контактная информация', {
        fill: DARK_BG,
        font: { ...WHITE_FONT, bold: true, sz: 11 },
        alignment: { vertical: 'center', wrapText: true },
        border: DARK_BORDER,
      }),
    )
    for (let c = 2; c < colCount; c++) {
      setCell(row, c, cell('', { fill: DARK_BG, border: DARK_BORDER }))
    }
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } })
    row++

    // Contact lines — each line occupies B..last column
    contactLines.forEach(line => {
      const url = isContactUrl(line)
      setCell(
        row,
        1,
        cell(` ${line}`, {
          font: url ? { ...FONT_BOLD, underline: true } : FONT_BOLD,
          alignment: { vertical: 'center', wrapText: true },
        }),
      )
      for (let c = 2; c < colCount; c++) {
        setCell(row, c, cell('', {}))
      }
      merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } })
      row++
    })

    // Decorative trailing row — empty content, same styling as contact
    // lines, creates a bottom margin against the edge. Mirrors the extra
    // row added in EstimateTable.tsx.
    setCell(
      row,
      1,
      cell(' ', {
        font: FONT_BOLD,
        alignment: { vertical: 'center', wrapText: true },
      }),
    )
    for (let c = 2; c < colCount; c++) {
      setCell(row, c, cell('', {}))
    }
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } })
    row++
  }

  // Build worksheet
  const range = { s: { r: 0, c: 0 }, e: { r: row, c: colCount - 1 } }
  ws['!ref'] = XLSX.utils.encode_range(range)
  ws['!merges'] = merges

  // Row heights — force separator rows to Excel's default (15pt) so they
  // don't look collapsed next to tall auto-sized content rows.
  const rowsMeta: { hpt: number }[] = []
  separatorRows.forEach(r => {
    rowsMeta[r] = { hpt: 15 }
  })
  // Detail block task rows get space for 7 lines of detailed description.
  detailBlockTaskRows.forEach(r => {
    rowsMeta[r] = { hpt: FIRST_BLOCK_ROW_HPT }
  })
  ws['!rows'] = rowsMeta

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // A: Блок работ
    { wch: 45 }, // B: Задача
    { wch: 14 }, // C: Всего часов
    { wch: 14 }, // D: Стоимость
    ...roles.map(() => ({ wch: 14 })),
    { wch: 5 },  // Trailing decorative column
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws as XLSX.WorkSheet, estimateSheetName)

  // === Second sheet: Дорожная карта ===
  const roadmapModel = generateRoadmapExportModel(estimate)
  const roadmapCalcResult = buildRoadmapCalcSheet(estimate, roadmapModel.descriptors, estimateRefs)
  const roadmapResult = buildRoadmapSheet(estimate, roadmapModel.rows, roadmapModel.months, roadmapCalcResult)
  if (roadmapResult && roadmapCalcResult) {
    XLSX.utils.book_append_sheet(wb, roadmapResult.ws, 'Дорожная карта')
    XLSX.utils.book_append_sheet(wb, roadmapCalcResult.ws, roadmapCalcResult.sheetName)
    wb.Workbook = {
      Sheets: wb.SheetNames.map(name => ({
        name,
        Hidden: name === roadmapCalcResult.sheetName ? 1 : 0,
      })),
    }
  }

  // Write the workbook to an ArrayBuffer so we can post-process the sheet XML
  // and inject rich text runs (xlsx-js-style can't produce them itself).
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const zip = await JSZip.loadAsync(buffer)

  // Post-process sheet1 (Оценка): inject rich text
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetFile = zip.file(sheetPath)
  if (sheetFile && richTextCells.length > 0) {
    let xml = await sheetFile.async('string')
    for (const rtc of richTextCells) {
      xml = injectRichText(xml, rtc)
    }
    zip.file(sheetPath, xml)
  }

  // Post-process sheet2 (Дорожная карта): inject freeze panes
  if (roadmapResult) {
    const sheet2Path = 'xl/worksheets/sheet2.xml'
    const sheet2File = zip.file(sheet2Path)
    if (sheet2File) {
      let xml2 = await sheet2File.async('string')
      xml2 = injectFreezePanes(xml2, roadmapResult.freezeRow, roadmapResult.freezeCol)
      zip.file(sheet2Path, xml2)
    }
  }

  const workbookPath = 'xl/workbook.xml'
  const workbookFile = zip.file(workbookPath)
  if (workbookFile) {
    const workbookXml = await workbookFile.async('string')
    zip.file(workbookPath, injectWorkbookCalcPr(workbookXml))
  }

  if (roadmapResult) {
    const stylesPath = 'xl/styles.xml'
    const stylesFile = zip.file(stylesPath)
    if (stylesFile) {
      const stylesXml = await stylesFile.async('string')
      const { xml: nextStylesXml, dxfIds } = injectRoadmapDxfStyles(stylesXml)
      zip.file(stylesPath, nextStylesXml)

      const sheet2Path = 'xl/worksheets/sheet2.xml'
      const sheet2File = zip.file(sheet2Path)
      if (sheet2File) {
        const xml2 = await sheet2File.async('string')
        zip.file(
          sheet2Path,
          injectRoadmapConditionalFormatting(xml2, roadmapResult.ganttFormatting, dxfIds),
        )
      }
    }
  }

  const outBuffer = await zip.generateAsync({ type: 'uint8array' })
  const outBytes = new Uint8Array(outBuffer)
  const outBlob = new Blob(
    [outBytes],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  )
  triggerDownload(`${estimate.projectName}.xlsx`, outBlob, options)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Replace the target cell's `<c>` element with an inlineStr cell containing
// two rich-text runs: a bold run for the title and a regular run for the rest.
// The cell's style index (`s="..."`) is preserved so borders, fill, and
// alignment stay intact.
interface RoadmapSheetResult {
  ws: XLSX.WorkSheet
  freezeRow: number  // number of rows to freeze from top
  freezeCol: number  // number of columns to freeze from left
  ganttFormatting: RoadmapGanttFormattingMeta
}

interface RoadmapCalcSheetResult {
  ws: XLSX.WorkSheet
  sheetName: string
  rowByDescriptorId: Map<string, number>
  hoursCol: string
  startCol: string
  endCol: string
}

interface RoadmapGanttFormattingMeta {
  firstDayCol: string
  lastDayCol: string
  dateMetaRow: number
  nonWorkMetaRow: number
  taskRows: number[]
  approvalRows: number[]
}

interface RoadmapGanttDxfIds {
  task: number
  taskNonWork: number
  approval: number
  approvalNonWork: number
}

function buildRoadmapCalcSheet(
  estimate: ProjectEstimate,
  descriptors: RoadmapRowDescriptor[],
  estimateRefs: EstimateSheetRefs,
): RoadmapCalcSheetResult | null {
  const calcRows = descriptors.filter(row => row.type === 'task' || row.type === 'approval')
  if (calcRows.length === 0) return null

  const ws: Record<string, unknown> = {}
  const sheetName = '__roadmap_calc'
  const settings = getSettings(estimate.roadmapSettings)
  const rowByDescriptorId = new Map<string, number>()
  const calcStartRow = 18
  const holidayCol = 'AA'
  const dataCols = {
    type: 'A',
    rowId: 'B',
    sourceTaskId: 'C',
    sourceRef: 'D',
    rawHours: 'E',
    taskSeq: 'F',
    approvalAlloc: 'G',
    pendingBefore: 'H',
    hours: 'I',
    anchor: 'J',
    overrideStart: 'K',
    overrideEnd: 'L',
    prevCursor: 'M',
    prevLoad: 'N',
    prevReserved: 'O',
    isSmall: 'P',
    baseStart: 'Q',
    startLoad: 'R',
    start: 'S',
    end: 'T',
    endLoad: 'U',
    pendingAfter: 'V',
    nextReserved: 'W',
    displayStart: 'X',
    displayEnd: 'Y',
  } as const

  function setCell(ref: string, val: unknown) {
    ws[ref] = val
  }

  function normalizeWorkdayFormula(dateExpr: string, holidayRangeRef: string) {
    return `IF($B$6=1,WORKDAY.INTL(${dateExpr}-1,1,$B$7,${holidayRangeRef}),WORKDAY.INTL(${dateExpr}-1,1,$B$7))`
  }

  function nextWorkdayAfterFormula(dateExpr: string, holidayRangeRef: string) {
    return normalizeWorkdayFormula(`${dateExpr}+1`, holidayRangeRef)
  }

  function shiftWorkdaysFormula(startExpr: string, offsetExpr: string, holidayRangeRef: string) {
    return `IF($B$6=1,WORKDAY.INTL(${startExpr},${offsetExpr},$B$7,${holidayRangeRef}),WORKDAY.INTL(${startExpr},${offsetExpr},$B$7))`
  }

  const allRelevantDates = [
    new Date(settings.startDate + 'T00:00:00'),
    ...descriptors.flatMap(row => [
      row.cachedStartDate,
      row.cachedEndDate,
      row.approvalAnchorDate,
      row.overrideStartDate,
      row.overrideEndDate,
    ]).filter((date): date is Date => Boolean(date)),
  ]
  const years = new Set<number>()
  allRelevantDates.forEach(date => {
    years.add(date.getFullYear() - 1)
    years.add(date.getFullYear())
    years.add(date.getFullYear() + 1)
  })
  const holidaySerials = Array.from(years)
    .sort((a, b) => a - b)
    .flatMap(year => {
      const dates: Date[] = []
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= 31; day++) {
          const candidate = new Date(year, month, day)
          if (candidate.getMonth() !== month) continue
          if (isHoliday(candidate)) dates.push(candidate)
        }
      }
      return dates
    })
    .map(excelDateSerial)

  setCell('A1', cell('Настройка', { font: FONT_BOLD }))
  setCell('B1', cell(excelDateSerial(new Date(settings.startDate + 'T00:00:00')), { font: FONT }))
  setCell('A2', cell('Часов в день', { font: FONT_BOLD }))
  setCell('B2', cell(settings.hoursPerDay, { font: FONT }))
  setCell('A3', cell('Порог стэкинга, %', { font: FONT_BOLD }))
  setCell('B3', cell(settings.smallTaskThreshold ?? 80, { font: FONT }))
  setCell('A4', cell('Порог стэкинга, ч', { font: FONT_BOLD }))
  setCell('B4', formulaCell(settings.hoursPerDay * ((settings.smallTaskThreshold ?? 80) / 100), 'B2*B3/100', { font: FONT }))
  setCell('A5', cell('Пропускать выходные', { font: FONT_BOLD }))
  setCell('B5', cell(settings.skipWeekends ? 1 : 0, { font: FONT }))
  setCell('A6', cell('Пропускать праздники', { font: FONT_BOLD }))
  setCell('B6', cell(settings.skipHolidays ? 1 : 0, { font: FONT }))
  setCell('A7', cell('Паттерн weekend', { font: FONT_BOLD }))
  setCell('B7', cell(settings.skipWeekends ? '0000011' : '0000000', { font: FONT }))
  setCell('A8', cell('Режим согласования', { font: FONT_BOLD }))
  setCell('B8', cell(settings.approvalMode ?? 'after-task', { font: FONT }))
  setCell('A9', cell('День weekly', { font: FONT_BOLD }))
  setCell('B9', cell(settings.approvalWeekday ?? 5, { font: FONT }))
  setCell('A10', cell('Всего часов согласования', { font: FONT_BOLD }))
  setCell('B10', formulaCell(
    estimate.sections
      .filter(section => section.sectionType === 'approval')
      .reduce((sum, section) => sum + sectionTotalHours(section), 0),
    sumFormula(estimateRefs.approvalHourRefs),
    { font: FONT, numFmt: NUM_FMT },
  ))
  setCell('A11', cell('Всего task-строк', { font: FONT_BOLD }))
  setCell('A12', cell('Начальный курсор', { font: FONT_BOLD }))

  setCell(`${holidayCol}1`, cell('Праздники', { font: FONT_BOLD }))
  if (holidaySerials.length === 0) {
    setCell(`${holidayCol}2`, cell('', {}))
  } else {
    holidaySerials.forEach((serial, idx) => {
      setCell(`${holidayCol}${idx + 2}`, cell(serial, { font: FONT, numFmt: 'dd.mm.yyyy' }))
    })
  }
  const holidayRangeRef = `$${holidayCol}$2:$${holidayCol}$${Math.max(holidaySerials.length + 1, 2)}`

  const headerRow = calcStartRow - 1
  ;[
    ['Тип', dataCols.type],
    ['Row ID', dataCols.rowId],
    ['Task ID', dataCols.sourceTaskId],
    ['Estimate Ref', dataCols.sourceRef],
    ['Raw Hours', dataCols.rawHours],
    ['Task Seq', dataCols.taskSeq],
    ['Approval Alloc', dataCols.approvalAlloc],
    ['Pending Before', dataCols.pendingBefore],
    ['Hours', dataCols.hours],
    ['Approval Anchor', dataCols.anchor],
    ['Override Start', dataCols.overrideStart],
    ['Override End', dataCols.overrideEnd],
    ['Prev Cursor', dataCols.prevCursor],
    ['Prev Load', dataCols.prevLoad],
    ['Prev Reserved', dataCols.prevReserved],
    ['Is Small', dataCols.isSmall],
    ['Base Start', dataCols.baseStart],
    ['Start Load', dataCols.startLoad],
    ['Start', dataCols.start],
    ['End', dataCols.end],
    ['End Load', dataCols.endLoad],
    ['Pending After', dataCols.pendingAfter],
    ['Next Reserved', dataCols.nextReserved],
    ['Display Start', dataCols.displayStart],
    ['Display End', dataCols.displayEnd],
  ].forEach(([label, col]) => {
    setCell(`${col}${headerRow}`, cell(label, { font: FONT_BOLD, fill: GRAY_BG }))
  })

  setCell(
    'B11',
    formulaCell(
      calcRows.filter(row => row.type === 'task').length,
      `COUNTIF($A$${calcStartRow}:$A$${calcStartRow + calcRows.length - 1},"task")`,
      { font: FONT, numFmt: '0' },
    ),
  )
  setCell(
    'B12',
    formulaCell(
      excelDateSerial(new Date(settings.startDate + 'T00:00:00')),
      normalizeWorkdayFormula('B1', holidayRangeRef),
      { font: FONT, numFmt: 'dd.mm.yyyy' },
    ),
  )

  let taskSequence = 0
  let pendingApprovalHours = 0
  let previousEnd = excelDateSerial(new Date(settings.startDate + 'T00:00:00'))
  let previousEndLoad = 0
  let previousReserved = 0

  calcRows.forEach((descriptor, idx) => {
    const excelRow = calcStartRow + idx
    rowByDescriptorId.set(descriptor.id, excelRow)

    const typeRef = `${dataCols.type}${excelRow}`
    const rawHoursRef = `${dataCols.rawHours}${excelRow}`
    const taskSeqRef = `${dataCols.taskSeq}${excelRow}`
    const approvalAllocRef = `${dataCols.approvalAlloc}${excelRow}`
    const pendingBeforeRef = `${dataCols.pendingBefore}${excelRow}`
    const hoursRef = `${dataCols.hours}${excelRow}`
    const anchorRef = `${dataCols.anchor}${excelRow}`
    const overrideStartRef = `${dataCols.overrideStart}${excelRow}`
    const overrideEndRef = `${dataCols.overrideEnd}${excelRow}`
    const prevCursorRef = `${dataCols.prevCursor}${excelRow}`
    const prevLoadRef = `${dataCols.prevLoad}${excelRow}`
    const prevReservedRef = `${dataCols.prevReserved}${excelRow}`
    const isSmallRef = `${dataCols.isSmall}${excelRow}`
    const baseStartRef = `${dataCols.baseStart}${excelRow}`
    const startLoadRef = `${dataCols.startLoad}${excelRow}`
    const startRef = `${dataCols.start}${excelRow}`
    const endRef = `${dataCols.end}${excelRow}`
    const endLoadRef = `${dataCols.endLoad}${excelRow}`
    const pendingAfterRef = `${dataCols.pendingAfter}${excelRow}`
    const nextReservedRef = `${dataCols.nextReserved}${excelRow}`
    const displayStartRef = `${dataCols.displayStart}${excelRow}`
    const displayEndRef = `${dataCols.displayEnd}${excelRow}`

    const rawHoursSourceRef = descriptor.sourceTaskId
      ? estimateRefs.taskHoursByTaskId.get(descriptor.sourceTaskId) ?? ''
      : ''
    let rowApprovalAlloc = 0

    if (descriptor.type === 'task') {
      taskSequence += 1
      rowApprovalAlloc = taskSequence > 0 && calcRows.filter(row => row.type === 'task').length > 0
        ? Math.max(
          0,
          Math.round((taskSequence * (estimate.sections
            .filter(section => section.sectionType === 'approval')
            .reduce((sum, section) => sum + sectionTotalHours(section), 0))
          ) / calcRows.filter(row => row.type === 'task').length)
          - Math.round(((taskSequence - 1) * (estimate.sections
            .filter(section => section.sectionType === 'approval')
            .reduce((sum, section) => sum + sectionTotalHours(section), 0))
          ) / calcRows.filter(row => row.type === 'task').length),
        )
        : 0
      setCell(rawHoursRef, formulaCell(descriptor.cachedHours, rawHoursSourceRef, { font: FONT, numFmt: NUM_FMT }))
      setCell(
        taskSeqRef,
        formulaCell(
          taskSequence,
          `IF(${typeRef}="task",COUNTIF($A$${calcStartRow}:${typeRef},"task"),"")`,
          { font: FONT, numFmt: '0' },
        ),
      )
      setCell(
        approvalAllocRef,
        formulaCell(
          rowApprovalAlloc,
          `IF(AND(${typeRef}="task",$B$11>0),MAX(0,ROUND(${taskSeqRef}*$B$10/$B$11,0)-ROUND((${taskSeqRef}-1)*$B$10/$B$11,0)),0)`,
          { font: FONT, numFmt: NUM_FMT },
        ),
      )
      pendingApprovalHours += rowApprovalAlloc
    } else {
      setCell(rawHoursRef, cell(0, { font: FONT, numFmt: NUM_FMT }))
      setCell(taskSeqRef, cell('', { font: FONT }))
      setCell(approvalAllocRef, cell(0, { font: FONT, numFmt: NUM_FMT }))
    }

    setCell(typeRef, cell(descriptor.type, { font: FONT }))
    setCell(`${dataCols.rowId}${excelRow}`, cell(descriptor.id, { font: FONT_SMALL }))
    setCell(`${dataCols.sourceTaskId}${excelRow}`, cell(descriptor.sourceTaskId ?? '', { font: FONT_SMALL }))
    setCell(`${dataCols.sourceRef}${excelRow}`, cell(rawHoursSourceRef, { font: FONT_SMALL }))

    setCell(
      pendingBeforeRef,
      formulaCell(
        descriptor.type === 'approval' ? pendingApprovalHours : idx === 0 ? 0 : pendingApprovalHours - rowApprovalAlloc,
        idx === 0 ? '0' : `${dataCols.pendingAfter}${excelRow - 1}`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )
    setCell(
      hoursRef,
      formulaCell(
        descriptor.cachedHours,
        `IF(${typeRef}="task",${rawHoursRef},${pendingBeforeRef})`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )

    const anchorSerial = descriptor.approvalAnchorDate ? excelDateSerial(descriptor.approvalAnchorDate) : ''
    const overrideStartSerial = descriptor.overrideStartDate ? excelDateSerial(descriptor.overrideStartDate) : ''
    const overrideEndSerial = descriptor.overrideEndDate ? excelDateSerial(descriptor.overrideEndDate) : ''
    setCell(anchorRef, cell(anchorSerial, { font: FONT, numFmt: 'dd.mm.yyyy' }))
    setCell(overrideStartRef, cell(overrideStartSerial, { font: FONT, numFmt: 'dd.mm.yyyy' }))
    setCell(overrideEndRef, cell(overrideEndSerial, { font: FONT, numFmt: 'dd.mm.yyyy' }))
    setCell(
      prevCursorRef,
      formulaCell(
        previousEnd,
        idx === 0 ? 'B12' : `${dataCols.end}${excelRow - 1}`,
        { font: FONT, numFmt: 'dd.mm.yyyy' },
      ),
    )
    setCell(
      prevLoadRef,
      formulaCell(
        previousEndLoad,
        idx === 0 ? '0' : `${dataCols.endLoad}${excelRow - 1}`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )
    setCell(
      prevReservedRef,
      formulaCell(
        previousReserved,
        idx === 0 ? '0' : `${dataCols.nextReserved}${excelRow - 1}`,
        { font: FONT, numFmt: '0' },
      ),
    )
    setCell(
      isSmallRef,
      formulaCell(
        descriptor.type === 'task' && !descriptor.overrideStartDate && !descriptor.overrideEndDate && descriptor.cachedHours < settings.hoursPerDay * ((settings.smallTaskThreshold ?? 80) / 100) ? 1 : 0,
        `--AND(${typeRef}="task",${hoursRef}<$B$4,${overrideStartRef}="",${overrideEndRef}="")`,
        { font: FONT, numFmt: '0' },
      ),
    )
    setCell(
      baseStartRef,
      formulaCell(
        descriptor.cachedStartDate ? excelDateSerial(descriptor.cachedStartDate) : '',
        `IF(${typeRef}="task",IF(${overrideStartRef}<>"",${normalizeWorkdayFormula(overrideStartRef, holidayRangeRef)},IF(${isSmallRef}=1,IF(${prevLoadRef}+${hoursRef}<=$B$2,${prevCursorRef},${nextWorkdayAfterFormula(prevCursorRef, holidayRangeRef)}),IF(AND(${prevLoadRef}>0,${prevReservedRef}=0),${nextWorkdayAfterFormula(prevCursorRef, holidayRangeRef)},${prevCursorRef}))),IF(${typeRef}="approval",IF(${prevCursorRef}<${anchorRef},${anchorRef},${prevCursorRef}),""))`,
        { font: FONT, numFmt: 'dd.mm.yyyy' },
      ),
    )
    setCell(
      startLoadRef,
      formulaCell(
        descriptor.cachedStartDate && excelDateSerial(descriptor.cachedStartDate) === previousEnd ? previousEndLoad : 0,
        `IF(${baseStartRef}=${prevCursorRef},${prevLoadRef},0)`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )
    setCell(
      startRef,
      formulaCell(
        descriptor.cachedStartDate ? excelDateSerial(descriptor.cachedStartDate) : '',
        baseStartRef,
        { font: FONT, numFmt: 'dd.mm.yyyy' },
      ),
    )
    const availableExpr = `($B$2-${startLoadRef})`
    const extraDaysExpr = `ROUNDUP((${hoursRef}-${availableExpr})/$B$2,0)`
    setCell(
      endRef,
      formulaCell(
        descriptor.cachedEndDate ? excelDateSerial(descriptor.cachedEndDate) : '',
        `IF(${overrideEndRef}<>"",${overrideEndRef},IF(${hoursRef}<=${availableExpr},${startRef},${shiftWorkdaysFormula(startRef, extraDaysExpr, holidayRangeRef)}))`,
        { font: FONT, numFmt: 'dd.mm.yyyy' },
      ),
    )
    const cachedEndLoad = (() => {
      const hours = descriptor.cachedHours
      if (descriptor.overrideEndDate) {
        const mod = hours % settings.hoursPerDay
        return mod === 0 ? settings.hoursPerDay : mod
      }
      const startLoad = descriptor.cachedStartDate && excelDateSerial(descriptor.cachedStartDate) === previousEnd ? previousEndLoad : 0
      const available = settings.hoursPerDay - startLoad
      if (hours <= available) return startLoad + hours
      const mod = (hours - available) % settings.hoursPerDay
      return mod === 0 ? settings.hoursPerDay : mod
    })()
    setCell(
      endLoadRef,
      formulaCell(
        cachedEndLoad,
        `IF(${overrideEndRef}<>"",IF(MOD(${hoursRef},$B$2)=0,$B$2,MOD(${hoursRef},$B$2)),IF(${hoursRef}<=${availableExpr},${startLoadRef}+${hoursRef},IF(MOD(${hoursRef}-${availableExpr},$B$2)=0,$B$2,MOD(${hoursRef}-${availableExpr},$B$2))))`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )
    const pendingAfterValue = descriptor.type === 'approval' ? 0 : pendingApprovalHours
    setCell(
      pendingAfterRef,
      formulaCell(
        pendingAfterValue,
        `IF(${typeRef}="approval",0,${pendingBeforeRef}+${approvalAllocRef})`,
        { font: FONT, numFmt: NUM_FMT },
      ),
    )
    setCell(
      nextReservedRef,
      formulaCell(
        descriptor.type === 'approval' ? 1 : 0,
        `--(${typeRef}="approval")`,
        { font: FONT, numFmt: '0' },
      ),
    )
    setCell(
      displayStartRef,
      formulaCell(
        descriptor.cachedStartDate ? descriptor.cachedStartDate.toLocaleDateString('ru-RU') : '',
        `TEXT(${startRef},"dd.mm.yyyy")`,
        { font: FONT_SMALL },
      ),
    )
    setCell(
      displayEndRef,
      formulaCell(
        descriptor.cachedEndDate ? descriptor.cachedEndDate.toLocaleDateString('ru-RU') : '',
        `TEXT(${endRef},"dd.mm.yyyy")`,
        { font: FONT_SMALL },
      ),
    )

    previousEnd = descriptor.cachedEndDate ? excelDateSerial(descriptor.cachedEndDate) : previousEnd
    previousEndLoad = cachedEndLoad
    previousReserved = descriptor.type === 'approval' ? 1 : 0
    if (descriptor.type === 'approval') pendingApprovalHours = 0
  })

  ws['!ref'] = `A1:${holidayCol}${calcStartRow + calcRows.length - 1}`
  ws['!cols'] = Array.from({ length: 27 }, (_, idx) => ({
    wch: idx < 4 ? 22 : idx < 13 ? 16 : 14,
  }))

  return {
    ws: ws as XLSX.WorkSheet,
    sheetName,
    rowByDescriptorId,
    hoursCol: dataCols.hours,
    startCol: dataCols.start,
    endCol: dataCols.end,
  }
}

function buildRoadmapSheet(
  estimate: ProjectEstimate,
  rows: RoadmapRow[],
  months: RoadmapMonth[],
  calcResult: RoadmapCalcSheetResult | null,
): RoadmapSheetResult | null {
  if (rows.length === 0 || months.length === 0 || !calcResult) return null

  const rws: Record<string, unknown> = {}
  const merges: XLSX.Range[] = []
  const darkStyle = { fill: DARK_BG, font: WHITE_FONT, alignment: CENTER, border: DARK_BORDER }
  const weekendHeaderStyle = { fill: PURPLE_BG, font: { ...FONT_SMALL, color: { rgb: '202020' } }, alignment: CENTER, border: DARK_BORDER }

  function setCell(r: number, c: number, val: unknown) {
    rws[XLSX.utils.encode_cell({ r, c })] = val
  }

  const allDays: Date[] = []
  for (const m of months) for (const d of m.days) allDays.push(d)
  const totalDayCols = allDays.length
  const dataCols = 6 // A-F: name, description, hours, start, end, note
  const firstDayCol = XLSX.utils.encode_col(dataCols)
  const lastDayCol = XLSX.utils.encode_col(dataCols + totalDayCols - 1)

  const rdSettings = getSettings(estimate.roadmapSettings)
  const disclaimerOffset = rdSettings.showDisclaimer ? 1 : 0
  const ganttTaskRows: number[] = []
  const ganttApprovalRows: number[] = []

  // Row 0 (optional): disclaimer merged across the info columns (A-F) only,
  // so the text wraps vertically instead of stretching into the day columns.
  if (rdSettings.showDisclaimer) {
    setCell(0, 0, cell('Сроки выполнения работ являются ориентировочными и определены при условии своевременного предоставления Заказчиком необходимой информации, материалов и согласования результатов работ.', { font: FONT_DISCLAIMER, alignment: { wrapText: true, vertical: 'top' } }))
    for (let c = 1; c < dataCols; c++) setCell(0, c, cell('', {}))
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: dataCols - 1 } })
  }

  // Dark header with month labels above day columns
  const hdrRow1 = disclaimerOffset
  setCell(hdrRow1, 0, cell('', darkStyle))
  for (let c = 1; c < dataCols; c++) setCell(hdrRow1, c, cell('', darkStyle))
  merges.push({ s: { r: hdrRow1, c: 0 }, e: { r: hdrRow1, c: dataCols - 1 } })

  let dayCol = dataCols
  for (const m of months) {
    setCell(hdrRow1, dayCol, cell(m.label, darkStyle))
    for (let i = 1; i < m.days.length; i++) setCell(hdrRow1, dayCol + i, cell('', darkStyle))
    if (m.days.length > 1) merges.push({ s: { r: hdrRow1, c: dayCol }, e: { r: hdrRow1, c: dayCol + m.days.length - 1 } })
    dayCol += m.days.length
  }

  // Column headers + day numbers
  const hdrRow2 = disclaimerOffset + 1
  setCell(hdrRow2, 0, cell('', darkStyle))
  setCell(hdrRow2, 1, cell('Задача', darkStyle))
  setCell(hdrRow2, 2, cell('Часы', darkStyle))
  setCell(hdrRow2, 3, cell('Начало', darkStyle))
  setCell(hdrRow2, 4, cell('Конец', darkStyle))
  setCell(hdrRow2, 5, cell('Примечание', darkStyle))

  for (let i = 0; i < allDays.length; i++) {
    const d = allDays[i]
    const nonWork = isWeekend(d) || (rdSettings.skipHolidays && isHoliday(d))
    setCell(hdrRow2, dataCols + i, cell(d.getDate(), nonWork ? weekendHeaderStyle : darkStyle))
  }

  // Data rows
  let r = disclaimerOffset + 2
  for (const row of rows) {
    if (row.type === 'section-header') {
      const sectionHeaderBg = rdSettings.grouping === 'by-section'
        ? { fgColor: { rgb: 'F7F7F7' } }
        : GRAY_BG
      const sectionHeaderFont = rdSettings.grouping === 'by-section'
        ? { ...FONT_SMALL, color: { rgb: '202020' }, bold: true }
        : DARK_FONT_BOLD
      setCell(r, 0, cell(row.taskName, { fill: sectionHeaderBg, font: sectionHeaderFont, alignment: { vertical: 'center' } }))
      for (let c = 1; c < dataCols + totalDayCols; c++) {
        setCell(r, c, cell('', { fill: sectionHeaderBg }))
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: dataCols + totalDayCols - 1 } })
      r++
      continue
    }

    if (row.type === 'feature-header') {
      const featureBg = rdSettings.grouping === 'by-section'
        ? { fgColor: { rgb: 'F1F1F1' } }
        : { fgColor: { rgb: 'F3F4F6' } } // matches web bg-gray-100
      setCell(r, 0, cell(row.taskName, { fill: featureBg, font: DARK_FONT_BOLD, alignment: { vertical: 'center' } }))
      for (let c = 1; c < dataCols + totalDayCols; c++) {
        setCell(r, c, cell('', { fill: featureBg }))
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: dataCols + totalDayCols - 1 } })
      r++
      continue
    }

    const isSecondaryRow = rdSettings.grouping === 'by-phase' && !row.description
    const bg = isSecondaryRow ? EVEN_BG : WHITE_BG
    const calcExcelRow = calcResult.rowByDescriptorId.get(row.id)
    const hoursFallback = row.hours > 0 ? row.hours : ''
    const startFallback = row.startDate ? excelDateSerial(row.startDate) : ''
    const endFallback = row.endDate ? excelDateSerial(row.endDate) : ''
    const hoursFormula = calcExcelRow
      ? `IFERROR(${sheetRef(calcResult.sheetName, `${calcResult.hoursCol}${calcExcelRow}`)},${formulaLiteral(hoursFallback)})`
      : formulaLiteral(hoursFallback)
    const startFormula = calcExcelRow
      ? `IFERROR(${sheetRef(calcResult.sheetName, `${calcResult.startCol}${calcExcelRow}`)},${formulaLiteral(startFallback)})`
      : formulaLiteral(startFallback)
    const endFormula = calcExcelRow
      ? `IFERROR(${sheetRef(calcResult.sheetName, `${calcResult.endCol}${calcExcelRow}`)},${formulaLiteral(endFallback)})`
      : formulaLiteral(endFallback)
    setCell(r, 0, cell(row.taskName, {
      fill: bg,
      font: rdSettings.grouping === 'by-phase'
        ? FONT_BOLD
        : rdSettings.grouping === 'by-section'
          ? MUTED_FONT_BOLD
          : FONT_SMALL,
      alignment: rdSettings.grouping === 'by-phase' ? TOP_LEFT : undefined,
    }))
    setCell(r, 1, cell(row.description, { fill: bg, font: FONT_SMALL, alignment: { wrapText: true } }))
    setCell(
      r,
      2,
      formulaCell(
        row.hours > 0 ? row.hours : '',
        hoursFormula,
        { fill: bg, font: FONT_SMALL, alignment: CENTER, numFmt: '0' },
      ),
    )
    setCell(
      r,
      3,
      formulaCell(
        row.startDate ? excelDateSerial(row.startDate) : '',
        startFormula,
        { fill: bg, font: FONT_SMALL, alignment: CENTER, numFmt: 'dd.mm.yyyy' },
      ),
    )
    setCell(
      r,
      4,
      formulaCell(
        row.endDate ? excelDateSerial(row.endDate) : '',
        endFormula,
        { fill: bg, font: FONT_SMALL, alignment: CENTER, numFmt: 'dd.mm.yyyy' },
      ),
    )
    setCell(r, 5, cell(row.note, { fill: bg, font: FONT_SMALL }))

    const excelRow = r + 1
    if (row.type === 'approval') {
      ganttApprovalRows.push(excelRow)
    } else {
      ganttTaskRows.push(excelRow)
    }

    for (let i = 0; i < allDays.length; i++) {
      setCell(r, dataCols + i, cell('', { fill: bg, border: BORDER_THIN }))
    }
    r++
  }

  const dateMetaRow = r
  const nonWorkMetaRow = r + 1
  setCell(dateMetaRow, 0, cell('__gantt_dates', { font: FONT_SMALL }))
  setCell(nonWorkMetaRow, 0, cell('__gantt_non_work', { font: FONT_SMALL }))
  for (let c = 1; c < dataCols; c++) {
    setCell(dateMetaRow, c, cell('', {}))
    setCell(nonWorkMetaRow, c, cell('', {}))
  }
  for (let i = 0; i < allDays.length; i++) {
    const d = allDays[i]
    const nonWork = isWeekend(d) || (rdSettings.skipHolidays && isHoliday(d))
    setCell(dateMetaRow, dataCols + i, cell(excelDateSerial(d), { font: FONT_SMALL, numFmt: 'dd.mm.yyyy' }))
    setCell(nonWorkMetaRow, dataCols + i, cell(nonWork ? 1 : 0, { font: FONT_SMALL, numFmt: '0' }))
  }

  const range = { s: { r: 0, c: 0 }, e: { r: nonWorkMetaRow, c: dataCols + totalDayCols - 1 } }
  rws['!ref'] = XLSX.utils.encode_range(range)
  rws['!merges'] = merges
  rws['!cols'] = [
    { wch: 24 },  // A: phase name
    { wch: 40 },  // B: description
    { wch: 7 },   // C: hours
    { wch: 13 },  // D: start
    { wch: 13 },  // E: end
    { wch: 22 },  // F: note
    ...allDays.map(() => ({ wch: 4 })),
  ]
  const rowsMeta: Array<{ hpt?: number, hidden?: boolean }> = []
  if (rdSettings.showDisclaimer) rowsMeta[0] = { hpt: 60 }
  rowsMeta[dateMetaRow] = { ...(rowsMeta[dateMetaRow] ?? {}), hidden: true }
  rowsMeta[nonWorkMetaRow] = { ...(rowsMeta[nonWorkMetaRow] ?? {}), hidden: true }
  rws['!rows'] = rowsMeta

  // Freeze panes: fix columns A-F and header rows
  const freezeRow = disclaimerOffset + 2
  return {
    ws: rws as XLSX.WorkSheet,
    freezeRow,
    freezeCol: dataCols,
    ganttFormatting: {
      firstDayCol,
      lastDayCol,
      dateMetaRow: dateMetaRow + 1,
      nonWorkMetaRow: nonWorkMetaRow + 1,
      taskRows: ganttTaskRows,
      approvalRows: ganttApprovalRows,
    },
  }
}

// Inject freeze panes into the sheet XML by replacing the <sheetViews> block
// with one that includes a <pane> element. This fixes columns 0..freezeCol-1
// and rows 0..freezeRow-1 so they stay visible during scrolling.
function injectFreezePanes(xml: string, freezeRow: number, freezeCol: number): string {
  const topLeftCell = `${XLSX.utils.encode_col(freezeCol)}${freezeRow + 1}`
  const pane =
    `<pane xSplit="${freezeCol}" ySplit="${freezeRow}"` +
    ` topLeftCell="${topLeftCell}" activePane="bottomRight" state="frozen"/>`
  const newViews =
    `<sheetViews><sheetView tabSelected="0" workbookViewId="0">${pane}</sheetView></sheetViews>`
  return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, newViews)
}

function injectRoadmapDxfStyles(xml: string): { xml: string, dxfIds: RoadmapGanttDxfIds } {
  const dxfMatch = xml.match(/<dxfs count="(\d+)"(?:\/>|>([\s\S]*?)<\/dxfs>)/)
  if (!dxfMatch) {
    throw new Error('styles.xml is missing <dxfs>, cannot inject gantt conditional formatting')
  }

  const existingCount = Number(dxfMatch[1] || 0)
  const existingBody = dxfMatch[2] ?? ''
  const ganttDxfs = [
    '<dxf><fill><patternFill patternType="solid"><fgColor rgb="FF6366F1"/><bgColor/></patternFill></fill></dxf>',
    '<dxf><fill><patternFill patternType="solid"><fgColor rgb="FFC4C5F8"/><bgColor/></patternFill></fill></dxf>',
    '<dxf><fill><patternFill patternType="solid"><fgColor rgb="FFF59E0B"/><bgColor/></patternFill></fill></dxf>',
    '<dxf><fill><patternFill patternType="solid"><fgColor rgb="FFFCD68C"/><bgColor/></patternFill></fill></dxf>',
  ]
  const dxfIds: RoadmapGanttDxfIds = {
    task: existingCount,
    taskNonWork: existingCount + 1,
    approval: existingCount + 2,
    approvalNonWork: existingCount + 3,
  }
  const nextDxfs = `<dxfs count="${existingCount + ganttDxfs.length}">${existingBody}${ganttDxfs.join('')}</dxfs>`

  return {
    xml: xml.replace(dxfMatch[0], nextDxfs),
    dxfIds,
  }
}

function injectRoadmapConditionalFormatting(
  xml: string,
  meta: RoadmapGanttFormattingMeta,
  dxfIds?: RoadmapGanttDxfIds,
): string {
  if (!dxfIds) return xml

  const rules: string[] = []
  let priority = 1

  const buildFormula = (row: number, nonWork: 0 | 1) => (
    `AND(` +
      `ISNUMBER($D${row}),` +
      `ISNUMBER($E${row}),` +
      `${meta.firstDayCol}$${meta.dateMetaRow}>=` +
      `$D${row},` +
      `${meta.firstDayCol}$${meta.dateMetaRow}<=` +
      `$E${row},` +
      `${meta.firstDayCol}$${meta.nonWorkMetaRow}=${nonWork}` +
    `)`
  )

  const appendRules = (
    rows: number[],
    workdayDxfId: number,
    nonWorkdayDxfId: number,
  ) => {
    rows.forEach(row => {
      const sqref = `${meta.firstDayCol}${row}:${meta.lastDayCol}${row}`
      const workdayFormula = escapeXml(buildFormula(row, 0))
      const nonWorkdayFormula = escapeXml(buildFormula(row, 1))
      rules.push(
        `<conditionalFormatting sqref="${sqref}">` +
          `<cfRule type="expression" dxfId="${workdayDxfId}" priority="${priority++}">` +
            `<formula>${workdayFormula}</formula>` +
          `</cfRule>` +
          `<cfRule type="expression" dxfId="${nonWorkdayDxfId}" priority="${priority++}">` +
            `<formula>${nonWorkdayFormula}</formula>` +
          `</cfRule>` +
        `</conditionalFormatting>`,
      )
    })
  }

  appendRules(meta.taskRows, dxfIds.task, dxfIds.taskNonWork)
  appendRules(meta.approvalRows, dxfIds.approval, dxfIds.approvalNonWork)

  if (rules.length === 0) return xml
  return xml.replace('</sheetData>', `</sheetData>${rules.join('')}`)
}

function injectRichText(sheetXml: string, rtc: RichTextCell): string {
  const cellPattern = new RegExp(
    `<c r="${rtc.ref}"([^>]*?)>[\\s\\S]*?</c>`,
  )
  const boldRun =
    '<r><rPr><b/><sz val="10"/><rFont val="Onest"/><family val="2"/></rPr>' +
    `<t xml:space="preserve">${escapeXml(rtc.bold)}</t></r>`
  const restRun =
    '<r><rPr><sz val="10"/><rFont val="Onest"/><family val="2"/></rPr>' +
    `<t xml:space="preserve">${escapeXml(rtc.rest)}</t></r>`
  return sheetXml.replace(cellPattern, (_match, rawAttrs: string) => {
    // Drop any existing t="..." attribute and force inlineStr.
    const cleanAttrs = rawAttrs
      .replace(/\s*t="[^"]*"/, '')
      .replace(/\s*xml:space="[^"]*"/, '')
    return `<c r="${rtc.ref}"${cleanAttrs} t="inlineStr"><is>${boldRun}${restRun}</is></c>`
  })
}
