import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx-js-style'
import JSZip from 'jszip'
import type { ProjectEstimate } from './types.js'
import {
  taskTotalHours, taskCost, sectionTotalHours, sectionTotalCost,
  sectionRoleHours, grandTotalHours, grandTotalCost, totalRoleHours,
} from './calculations.js'
import { getContactLines, isContactUrl } from './reducer.js'

const FONT = { name: 'Onest', sz: 10 }
const FONT_SMALL = { ...FONT, sz: 9 }
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
const DARK_FONT_BOLD = { ...FONT, bold: true, color: { rgb: '202020' }, sz: 11 }

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'E0E0E0' } },
  bottom: { style: 'thin', color: { rgb: 'E0E0E0' } },
  left: { style: 'thin', color: { rgb: 'E0E0E0' } },
  right: { style: 'thin', color: { rgb: 'E0E0E0' } },
} as const

const DARK_BORDER = {
  top: { style: 'thin', color: { rgb: '202020' } },
  bottom: { style: 'thin', color: { rgb: '202020' } },
  left: { style: 'thin', color: { rgb: '202020' } },
  right: { style: 'thin', color: { rgb: '202020' } },
} as const

const CENTER = { horizontal: 'center', vertical: 'center', wrapText: true } as const
const BOTTOM = { vertical: 'bottom', wrapText: true } as const
const TOP_LEFT = { vertical: 'top', horizontal: 'left', wrapText: true } as const
const BOTTOM_RIGHT = { vertical: 'bottom', horizontal: 'right', wrapText: true } as const
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

interface RichTextCell {
  ref: string
  bold: string
  rest: string
}

export async function exportToXlsxFile(estimate: ProjectEstimate, outputPath: string) {
  const { roles, sections, contact } = estimate
  const colCount = 5 + roles.length
  const ws: Record<string, unknown> = {}
  const merges: XLSX.Range[] = []
  const richTextCells: RichTextCell[] = []
  const separatorRows: number[] = []
  let row = 0

  function setCell(r: number, c: number, val: unknown) {
    const ref = XLSX.utils.encode_cell({ r, c })
    ws[ref] = val
  }

  function colLetter(c: number) {
    return XLSX.utils.encode_col(c)
  }

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

  // Row 0: Header row 1
  const darkStyle = { fill: DARK_BG, font: WHITE_FONT, alignment: CENTER, border: DARK_BORDER }
  setCell(0, 0, cell('', darkStyle))
  setCell(0, 1, cell('', darkStyle))
  setCell(1, 0, cell('', darkStyle))
  setCell(1, 1, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } })

  setCell(0, 2, cell('Всего часов', darkStyle))
  setCell(1, 2, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 2 }, e: { r: 1, c: 2 } })

  setCell(0, 3, cell('Стоимость', darkStyle))
  setCell(1, 3, cell('', darkStyle))
  merges.push({ s: { r: 0, c: 3 }, e: { r: 1, c: 3 } })

  // Role category headers (row 0)
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

  // Trailing decorative column
  const trailCol = colCount - 1
  setCell(0, trailCol, cell('', darkStyle))
  setCell(1, trailCol, cell('', darkStyle))
  merges.push({ s: { r: 0, c: trailCol }, e: { r: 1, c: trailCol } })

  row = 2

  // Row 2: grand totals
  const sectionTotalRows: number[] = []
  setCell(row, 0, cell('Блок работ', { font: MUTED_FONT }))
  setCell(row + 1, 0, cell('', { font: MUTED_FONT }))
  setCell(row + 2, 0, cell('', { font: MUTED_FONT }))
  merges.push({ s: { r: row, c: 0 }, e: { r: row + 2, c: 0 } })

  setCell(row, 1, cell('Задача / Раздел', { font: MUTED_FONT, alignment: { wrapText: true } }))
  setCell(row + 1, 1, cell('', { font: MUTED_FONT }))
  setCell(row + 2, 1, cell('', { font: MUTED_FONT }))
  merges.push({ s: { r: row, c: 1 }, e: { r: row + 2, c: 1 } })

  setCell(row, 2, cell(grandTotalHours(estimate), { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: '0' }))
  setCell(row + 1, 2, cell('', {}))
  setCell(row + 2, 2, cell('', {}))

  setCell(row, 3, cell(grandTotalCost(estimate), { fill: PURPLE_BG, font: FONT_BOLD_LG, alignment: CENTER, numFmt: NUM_FMT }))

  roles.forEach((role, i) => {
    setCell(row, 4 + i, cell(totalRoleHours(estimate, role.id) * role.hourlyRate, { fill: PURPLE_BG, font: FONT, alignment: { ...BOTTOM_RIGHT }, numFmt: NUM_FMT }))
  })
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

  const detailBlockTaskRows: number[] = []

  // Sections
  sections.forEach((section, sIdx) => {
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

    const isDetailBlock = sIdx === 0 && !isHeaderOnly
    const textAlign = isDetailBlock ? TOP_LEFT : BOTTOM

    setCell(row, 0, cell(section.name, { fill: GRAY_BG, font: DARK_FONT_BOLD, alignment: { vertical: 'top', wrapText: true } }))
    if (taskCount > 0) {
      for (let i = 1; i <= taskCount; i++) {
        setCell(row + i, 0, cell('', { fill: GRAY_BG }))
      }
      merges.push({ s: { r: row, c: 0 }, e: { r: row + taskCount, c: 0 } })
    }

    section.tasks.forEach((task, tIdx) => {
      if (task.isDivider) {
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
      const showDescription = !isHeaderOnly && !!task.description
      const displayText = showDescription ? `${task.title}\n\n${task.description}` : task.title

      if (showDescription) {
        setCell(row, 1, cell(displayText, { fill: bg, font: FONT, alignment: { ...textAlign } }))
        richTextCells.push({
          ref: XLSX.utils.encode_cell({ r: row, c: 1 }),
          bold: task.title,
          rest: `\n\n${task.description}`,
        })
      } else {
        setCell(row, 1, cell(displayText, { fill: bg, font: FONT, alignment: { ...textAlign } }))
      }
      const excelRow = row + 1
      const roleRange = `${roleStartLetter}${excelRow}:${roleEndLetter}${excelRow}`
      setCell(
        row,
        2,
        formulaCell(
          taskTotalHours(task) || '',
          `IF(COUNT(${roleRange})=0,"",SUM(${roleRange}))`,
          { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: '0' },
        ),
      )
      setCell(
        row,
        3,
        formulaCell(
          taskCost(task, roles) || '',
          `IF(COUNT(${roleRange})=0,"",SUMPRODUCT(${roleRange},${rateRangeAbs}))`,
          { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: NUM_FMT },
        ),
      )
      roles.forEach((role, i) => {
        setCell(row, 4 + i, cell(task.hours[role.id] || '', { fill: bg, font: FONT, alignment: { ...numAlign }, numFmt: NUM_FMT }))
      })
      setCell(row, trailCol, cell('', { fill: bg }))
      if (isDetailBlock) detailBlockTaskRows.push(row)
      row++
    })

    // Subtotal row
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
    row++
    separatorRows.push(row)
    row++
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

  // Contact info
  {
    const contactLines = getContactLines(contact.lines)
    separatorRows.push(row)
    row++
    const blockStartRow = row
    const blockEndRow = row + contactLines.length + 1

    for (let r = blockStartRow; r <= blockEndRow; r++) {
      setCell(r, 0, cell('', { fill: DARK_BG, border: DARK_BORDER }))
    }
    merges.push({ s: { r: blockStartRow, c: 0 }, e: { r: blockEndRow, c: 0 } })

    setCell(
      row, 1,
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

    contactLines.forEach(line => {
      const url = isContactUrl(line)
      setCell(
        row, 1,
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

    setCell(
      row, 1,
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

  const rowsMeta: { hpt: number }[] = []
  separatorRows.forEach(r => {
    rowsMeta[r] = { hpt: 15 }
  })
  detailBlockTaskRows.forEach(r => {
    rowsMeta[r] = { hpt: FIRST_BLOCK_ROW_HPT }
  })
  ws['!rows'] = rowsMeta

  ws['!cols'] = [
    { wch: 22 },
    { wch: 45 },
    { wch: 14 },
    { wch: 14 },
    ...roles.map(() => ({ wch: 14 })),
    { wch: 5 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws as XLSX.WorkSheet, 'Оценка')

  // Write to buffer and post-process for rich text
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const zip = await JSZip.loadAsync(buffer)
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetFile = zip.file(sheetPath)
  if (sheetFile && richTextCells.length > 0) {
    let xml = await sheetFile.async('string')
    for (const rtc of richTextCells) {
      xml = injectRichText(xml, rtc)
    }
    zip.file(sheetPath, xml)
  }

  const workbookPath = 'xl/workbook.xml'
  const workbookFile = zip.file(workbookPath)
  if (workbookFile) {
    const workbookXml = await workbookFile.async('string')
    zip.file(workbookPath, injectWorkbookCalcPr(workbookXml))
  }

  // Generate as Node.js Buffer and write to disk
  const outBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(outputPath, outBuffer)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
    const cleanAttrs = rawAttrs
      .replace(/\s*t="[^"]*"/, '')
      .replace(/\s*xml:space="[^"]*"/, '')
    return `<c r="${rtc.ref}"${cleanAttrs} t="inlineStr"><is>${boldRun}${restRun}</is></c>`
  })
}
