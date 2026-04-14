import { useMemo } from 'react'
import { useStore } from '../../store'
import { generateRoadmap, getSettings, isDateInRange, isWeekend, isHoliday, formatDateShort } from '../../lib/roadmap'
import type { RoadmapRow, RoadmapMonth } from '../../lib/roadmap'

const CELL = 'border-r border-b border-border px-1.5 py-0.5'
const CELL_DARK = 'border-r border-b border-dark px-1.5 py-0.5'

const GANTT_COLORS: Record<RoadmapRow['type'], string> = {
  'section-header': '',
  'feature-header': '',
  'task': '#6366f1',
  'approval': '#f59e0b',
}

// Sticky left offsets for the 6 info columns (cumulative widths)
// Col widths: 160, 280, 50, 90, 90, 160
const STICKY: { left: number; width: number }[] = [
  { left: 0, width: 160 },
  { left: 160, width: 280 },
  { left: 440, width: 50 },
  { left: 490, width: 90 },
  { left: 580, width: 90 },
  { left: 670, width: 160 },
]

// Header row height: border-t(1) + py-0.5(2) + text-excel-9 line(18) + py-0.5(2) + border-b(1) = 24
const HDR_ROW_H = 24

const STICKY_Z = 'z-10'
const STICKY_Z_HEAD = 'z-20'
// Corner cells: sticky in both directions, highest z
const STICKY_Z_CORNER = 'z-30'

function stickyStyle(colIdx: number): React.CSSProperties {
  return { position: 'sticky', left: STICKY[colIdx].left, minWidth: STICKY[colIdx].width }
}

function stickyHeadStyle(colIdx: number, row: 0 | 1): React.CSSProperties {
  return {
    position: 'sticky',
    left: STICKY[colIdx].left,
    top: row === 0 ? 0 : HDR_ROW_H,
    minWidth: STICKY[colIdx].width,
  }
}

function stickyTopStyle(row: 0 | 1): React.CSSProperties {
  return { position: 'sticky', top: row === 0 ? 0 : HDR_ROW_H }
}

export function RoadmapTable() {
  const { state } = useStore()
  const settings = getSettings(state.roadmapSettings)
  const { rows, months } = useMemo(() => generateRoadmap(state), [state])

  if (state.sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-excel-10">
        Заполните данные в редакторе, чтобы увидеть дорожную карту
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-excel-10">
        Добавьте часы к задачам, чтобы сгенерировать дорожную карту
      </div>
    )
  }

  return (
    <>
      <table
        className="border-separate text-excel-10"
        style={{ fontFamily: "'Onest', sans-serif", tableLayout: 'fixed', width: 'max-content', borderSpacing: 0 }}
      >
        <colgroup>
          {STICKY.map((s, i) => <col key={i} style={{ width: s.width }} />)}
          {months.map(m => m.days.map((_, i) => (
            <col key={`${m.label}-${i}`} style={{ width: 28 }} />
          )))}
        </colgroup>

        <thead>
          {/* Row 1: Month headers */}
          <tr>
            {STICKY.map((_, i) => (
              <th
                key={i}
                className={`${CELL_DARK} border-t ${i === 0 ? 'border-l' : ''} bg-dark text-white ${STICKY_Z_CORNER}`}
                style={stickyHeadStyle(i, 0)}
              />
            ))}
            {months.map(m => (
              <th
                key={m.label}
                className={`${CELL_DARK} border-t bg-dark text-white text-center text-excel-9 font-bold ${STICKY_Z_HEAD}`}
                colSpan={m.days.length}
                style={stickyTopStyle(0)}
              >
                {m.label}
              </th>
            ))}
          </tr>
          {/* Row 2: Day numbers + column headers */}
          <tr>
            <th className={`${CELL_DARK} border-l bg-dark text-white text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(0, 1)}></th>
            <th className={`${CELL_DARK} bg-dark text-white text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(1, 1)}>Задача</th>
            <th className={`${CELL_DARK} bg-dark text-white text-center text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(2, 1)}>Часы</th>
            <th className={`${CELL_DARK} bg-dark text-white text-center text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(3, 1)}>Начало</th>
            <th className={`${CELL_DARK} bg-dark text-white text-center text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(4, 1)}>Конец</th>
            <th className={`${CELL_DARK} bg-dark text-white text-excel-9 ${STICKY_Z_CORNER}`} style={stickyHeadStyle(5, 1)}>Примечание</th>
            {months.map(m => m.days.map((d, i) => {
              const nonWork = isWeekend(d) || (settings.skipHolidays && isHoliday(d))
              return (
                <th
                  key={`${m.label}-d-${i}`}
                  className={`${CELL_DARK} text-center text-excel-9 ${nonWork ? 'bg-purple-bg text-dark' : 'bg-dark text-white'} ${STICKY_Z_HEAD}`}
                  style={{ minWidth: 28, ...stickyTopStyle(1) }}
                >
                  {d.getDate()}
                </th>
              )
            }))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, idx) => (
            <RoadmapRowComponent
              key={idx}
              row={row}
              months={months}
              skipHolidays={settings.skipHolidays}
              grouping={settings.grouping}
            />
          ))}
        </tbody>
      </table>
    </>
  )
}

function RoadmapRowComponent({
  row,
  months,
  skipHolidays,
  grouping,
}: {
  row: RoadmapRow
  months: RoadmapMonth[]
  skipHolidays: boolean
  grouping: 'by-phase' | 'by-section'
}) {
  if (row.type === 'section-header') {
    const totalDays = months.reduce((sum, m) => sum + m.days.length, 0)
    const isBySection = grouping === 'by-section'
    return (
      <tr>
        <td
          className={`${CELL} border-l ${isBySection ? 'bg-[#F7F7F7] text-excel-9 text-dark' : 'bg-gray-bg text-excel-11 text-dark'} ${isBySection ? 'font-semibold' : 'font-bold'} ${STICKY_Z}`}
          colSpan={6}
          style={stickyStyle(0)}
        >
          {row.taskName}
        </td>
        <td
          className={`${CELL} ${isBySection ? 'bg-[#F7F7F7]' : 'bg-gray-bg'}`}
          colSpan={totalDays}
        />
      </tr>
    )
  }

  if (row.type === 'feature-header') {
    const totalDays = months.reduce((sum, m) => sum + m.days.length, 0)
    const isBySection = grouping === 'by-section'
    return (
      <tr>
        <td
          className={`${CELL} border-l ${isBySection ? 'bg-[#F1F1F1] text-excel-11' : 'bg-gray-100 text-excel-10'} font-bold text-dark ${STICKY_Z}`}
          colSpan={6}
          style={stickyStyle(0)}
        >
          {row.taskName}
        </td>
        <td
          className={`${CELL} ${isBySection ? 'bg-[#F1F1F1]' : 'bg-gray-100'}`}
          colSpan={totalDays}
        />
      </tr>
    )
  }

  const isSecondaryRow = grouping === 'by-phase' && !row.description
  const bgClass = isSecondaryRow ? 'bg-gray-100' : 'bg-white'
  const isByPhase = grouping === 'by-phase'
  const isBySection = grouping === 'by-section'
  const taskCellClass = isByPhase
    ? 'align-top font-bold text-excel-9'
    : isBySection
      ? 'font-semibold text-excel-9'
      : row.type === 'approval'
        ? 'font-medium text-excel-9'
        : 'text-excel-9'
  const taskCellStyle = isBySection ? { ...stickyStyle(0), color: '#7B8190' } : stickyStyle(0)
  const ganttColor = GANTT_COLORS[row.type]

  return (
    <tr>
      <td className={`${CELL} border-l ${bgClass} ${taskCellClass} ${STICKY_Z}`} style={taskCellStyle}>{row.taskName}</td>
      <td className={`${CELL} ${bgClass} text-excel-9 ${STICKY_Z}`} style={stickyStyle(1)}>{row.description}</td>
      <td className={`${CELL} ${bgClass} text-center text-excel-9 ${STICKY_Z}`} style={stickyStyle(2)}>
        {row.hours > 0 ? row.hours : ''}
      </td>
      <td className={`${CELL} ${bgClass} text-center text-excel-9 ${STICKY_Z}`} style={stickyStyle(3)}>
        {row.startDate ? formatDateShort(row.startDate) : ''}
      </td>
      <td className={`${CELL} ${bgClass} text-center text-excel-9 ${STICKY_Z}`} style={stickyStyle(4)}>
        {row.endDate ? formatDateShort(row.endDate) : ''}
      </td>
      <td className={`${CELL} ${bgClass} text-excel-9 ${STICKY_Z}`} style={stickyStyle(5)}>{row.note}</td>
      {months.map(m => m.days.map((d, i) => {
        const inRange = isDateInRange(d, row.startDate, row.endDate)
        const nonWork = isWeekend(d) || (skipHolidays && isHoliday(d))
        let style: React.CSSProperties = { minWidth: 28 }
        if (inRange && !nonWork) {
          style.backgroundColor = ganttColor
        } else if (inRange && nonWork) {
          style.backgroundColor = ganttColor + '40'
        }
        return (
          <td
            key={`${m.label}-${i}`}
            className={`${CELL} ${bgClass}`}
            style={style}
          />
        )
      }))}
    </tr>
  )
}
