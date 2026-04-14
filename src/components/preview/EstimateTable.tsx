import { Fragment } from 'react'
import { useStore, getContactLines, isContactUrl } from '../../store'
import {
  taskTotalHours, taskCost, sectionTotalHours, sectionTotalCost,
  sectionRoleHours, grandTotalHours, grandTotalCost, totalRoleHours, formatNumber,
} from '../../lib/calculations'

// Every style token used in this table must have a 1:1 counterpart in
// src/lib/export.ts. If a visual property does not exist in Excel, it must
// not appear here.
//
// Allowed primitives (all defined in src/index.css @theme):
//   - colors:      dark, gray-bg, purple-bg, purple-text, row-even, row-odd,
//                  muted, border
//   - font sizes:  text-excel-9 (9pt), text-excel-10 (10pt),
//                  text-excel-11 (11pt), text-excel-14 (14pt)
//   - weight:      font-bold (or default) — Excel has no font-medium
//   - alignment:   text-left / text-center / text-right,
//                  align-top / align-middle / align-bottom
//
// Padding is kept uniform because Excel has no per-cell padding.
// Vertical padding is minimal (2px) to match Excel's auto row height at 10pt,
// which is ~20px. Horizontal padding is ~6px to match Excel's default indent.

const CELL = 'border border-border px-1.5 py-0.5'
// Dark-fill cells get a matching dark border — otherwise the default
// light-gray border shows through as a near-white divider on top of the
// black header/contact blocks. Mirrors DARK_BORDER in src/lib/export.ts.
const CELL_DARK = 'border border-dark px-1.5 py-0.5'

export function EstimateTable() {
  const { state } = useStore()
  const { roles, sections, contact } = state

  if (sections.length === 0 && roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-excel-10">
        Заполните данные в редакторе слева
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="border-collapse text-excel-10"
        style={{ fontFamily: "'Onest', sans-serif", tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}
      >
        <colgroup>
          <col style={{ width: 140 }} />
          <col style={{ width: 300 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          {roles.map(r => <col key={r.id} style={{ width: 100 }} />)}
          <col style={{ width: 40 }} />
        </colgroup>
        {/* Row 1–2: Dark header */}
        <thead>
          <tr>
            <th
              className={`${CELL_DARK} bg-dark text-white text-center`}
              rowSpan={2}
              colSpan={2}
            ></th>
            <th
              className={`${CELL_DARK} bg-dark text-white text-center`}
              rowSpan={2}
              style={{ minWidth: 90 }}
            >
              Всего часов
            </th>
            <th
              className={`${CELL_DARK} bg-dark text-white text-center`}
              rowSpan={2}
              style={{ minWidth: 90 }}
            >
              Стоимость
            </th>
            {(() => {
              const categories: { name: string; count: number }[] = []
              roles.forEach(role => {
                const last = categories[categories.length - 1]
                if (last && last.name === role.category) {
                  last.count++
                } else {
                  categories.push({ name: role.category, count: 1 })
                }
              })
              return categories.map((cat, i) => (
                <th
                  key={i}
                  className={`${CELL_DARK} bg-dark text-white text-center`}
                  colSpan={cat.count}
                  style={{ minWidth: cat.count * 90 }}
                >
                  {cat.name}
                </th>
              ))
            })()}
            <th className={`${CELL_DARK} bg-dark`} rowSpan={2}></th>
          </tr>
          <tr>
            {roles.map(role => (
              <th
                key={role.id}
                className={`${CELL_DARK} bg-dark text-purple-text text-excel-9 text-center`}
                style={{ minWidth: 90 }}
              >
                {role.title}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Row 3: Grand totals — a single horizontal strip of purple across
              Всего часов, Стоимость and every role column. The Всего часов
              cell is rs=1 (no longer merged down into the Кол-во часов /
              Ставка часа rows), so the purple highlight stays contained to
              this one row — matching the reference Excel layout. */}
          <tr className="text-muted text-excel-9">
            <td className={`${CELL} align-bottom`} rowSpan={3}>Блок работ</td>
            <td className={`${CELL} align-bottom`} rowSpan={3}>Задача / Раздел</td>
            <td
              className={`${CELL} text-center bg-purple-bg font-bold text-excel-14 text-dark`}
            >
              {grandTotalHours(state)}
            </td>
            <td
              className={`${CELL} text-center bg-purple-bg font-bold text-excel-14 text-dark`}
            >
              {formatNumber(grandTotalCost(state))}
            </td>
            {roles.map(role => (
              <td
                key={role.id}
                className={`${CELL} text-right align-bottom bg-purple-bg text-excel-10 text-dark`}
              >
                {formatNumber(totalRoleHours(state, role.id) * role.hourlyRate)}
              </td>
            ))}
            <td className={`${CELL} bg-purple-bg`}></td>
          </tr>

          {/* Row 4: Кол-во часов */}
          <tr className="text-muted text-excel-9">
            <td className={CELL}></td>
            <td className={`${CELL} text-right align-bottom`}>Кол-во часов</td>
            {roles.map(role => (
              <td key={role.id} className={`${CELL} text-right align-bottom text-excel-10 text-dark`}>
                {formatNumber(totalRoleHours(state, role.id))}
              </td>
            ))}
            <td className={CELL}></td>
          </tr>

          {/* Row 5: Ставка часа */}
          <tr className="text-muted text-excel-9">
            <td className={CELL}></td>
            <td className={`${CELL} text-right align-bottom`}>Ставка часа (руб.)</td>
            {roles.map(role => (
              <td key={role.id} className={`${CELL} text-right align-bottom text-excel-10 text-dark`}>
                {formatNumber(role.hourlyRate)}
              </td>
            ))}
            <td className={CELL}></td>
          </tr>

          {/* Sections */}
          {sections.map((section, sIdx) => {
            // First block houses the detailed, per-task breakdown. Its task
            // text cell gets a min height of 7 text lines (~105pt / 140px)
            // with text anchored top-left, so there's always room for a full
            // description. Numerics throughout the table are always pinned
            // to the bottom-right.
            const numAlign = 'text-right align-bottom'

            // In a linked pair, the section that appears FIRST in the sidebar
            // shows full details (bold title + description). The second one
            // shows only titles (no bold, no description). Determined by which
            // linked sibling has a lower index in the sections array.
            const isHeaderOnly = (() => {
              if (!section.linkedGroupId || section.linkBroken) return false
              const siblingIdx = sections.findIndex(
                s => s.linkedGroupId === section.linkedGroupId && s.id !== section.id,
              )
              return siblingIdx !== -1 && siblingIdx < sIdx
            })()

            // Only the very first section gets tall rows with top-aligned text;
            // all subsequent sections use auto height based on content.
            const isDetailBlock = sIdx === 0 && !isHeaderOnly
            const titleAlign = isDetailBlock ? 'align-top text-left' : 'align-bottom'
            const rowHeightStyle = isDetailBlock ? { height: 140 } : undefined

            return (<Fragment key={section.id}>
              {section.tasks.map((task, tIdx) => {
                const rowBg = tIdx % 2 === 0 ? 'bg-row-odd' : 'bg-row-even'

                if (task.isDivider) {
                  return (
                    <tr key={task.id}>
                      {tIdx === 0 && (
                        <td
                          className={`${CELL} bg-gray-bg font-bold text-excel-11 align-top ${section.name ? 'text-dark' : 'text-muted'}`}
                          rowSpan={section.tasks.length + 1}
                        >
                          {section.name || 'Название блока'}
                        </td>
                      )}
                      <td
                        className={`${CELL} bg-gray-bg text-dark font-bold`}
                        colSpan={4 + roles.length}
                      >
                        {task.title || 'Название группы'}
                      </td>
                    </tr>
                  )
                }

                // Whether this task cell will actually show a description
                const showDescription = !isHeaderOnly && !!task.description
                // If no description is visible, the title uses regular weight
                const titleWeight = showDescription ? 'font-bold' : ''

                return (
                  <tr key={task.id}>
                    {tIdx === 0 && (
                      <td
                        className={`${CELL} bg-gray-bg font-bold text-excel-11 align-top ${section.name ? 'text-dark' : 'text-muted'}`}
                        rowSpan={section.tasks.length + 1}
                      >
                        {section.name || 'Название блока'}
                      </td>
                    )}
                    <td
                      className={`${CELL} ${titleAlign} ${rowBg}`}
                      style={rowHeightStyle}
                    >
                      <div className={`${titleWeight} ${task.title ? '' : 'text-muted'}`}>
                        {task.title || 'Название задачи'}
                      </div>
                      {showDescription && (
                        <>
                          <div className="h-3"></div>
                          <div className="whitespace-pre-line">{task.description}</div>
                        </>
                      )}
                    </td>
                    <td className={`${CELL} ${numAlign} ${rowBg}`}>
                      {taskTotalHours(task) || ''}
                    </td>
                    <td className={`${CELL} ${numAlign} ${rowBg}`}>
                      {taskCost(task, roles) ? formatNumber(taskCost(task, roles)) : ''}
                    </td>
                    {roles.map(role => (
                      <td
                        key={role.id}
                        className={`${CELL} ${numAlign} ${rowBg}`}
                      >
                        {task.hours[role.id] || ''}
                      </td>
                    ))}
                    <td className={`${CELL} ${rowBg}`}></td>
                  </tr>
                )
              })}

              {/* Subtotal row */}
              <tr key={`${section.id}-total`}>
                <td className={`${CELL} bg-gray-bg font-bold text-right align-bottom`}>Итог</td>
                <td className={`${CELL} bg-gray-bg font-bold text-right align-bottom`}>
                  {sectionTotalHours(section)}
                </td>
                <td className={`${CELL} bg-gray-bg font-bold text-right align-bottom`}>
                  {formatNumber(sectionTotalCost(section, roles))}
                </td>
                {roles.map(role => (
                  <td
                    key={role.id}
                    className={`${CELL} bg-gray-bg font-bold text-right align-bottom`}
                  >
                    {sectionRoleHours(section, role.id) || ''}
                  </td>
                ))}
                <td className={`${CELL} bg-gray-bg`}></td>
              </tr>

              {/* Empty separator row — matches the empty row export.ts inserts
                  between sections. */}
              <tr key={`${section.id}-sep`}>
                <td colSpan={5 + roles.length} className="p-0 h-2"></td>
              </tr>
            </Fragment>
            )
          })}

          {/* Contact info — always visible at the end */}
          {(() => {
            const lines = getContactLines(contact.lines)
            return (
              <>
                <tr>
                  <td colSpan={5 + roles.length} className="p-0 h-4"></td>
                </tr>
                <tr>
                  <td
                    className={`${CELL_DARK} bg-dark`}
                    rowSpan={lines.length + 2}
                  ></td>
                  <td
                    className={`${CELL_DARK} bg-dark text-white font-bold text-excel-11`}
                    colSpan={4 + roles.length}
                  >
                    Контактная информация
                  </td>
                </tr>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td
                      className={`${CELL} font-bold`}
                      colSpan={4 + roles.length}
                    >
                      &nbsp;{isContactUrl(line) ? <span className="underline">{line}</span> : line}
                    </td>
                  </tr>
                ))}
                {/* Decorative trailing row — empty content, same styling as
                    contact lines, creates a bottom margin against the edge. */}
                <tr>
                  <td
                    className={`${CELL} font-bold`}
                    colSpan={4 + roles.length}
                  >
                    &nbsp;
                  </td>
                </tr>
              </>
            )
          })()}
        </tbody>
      </table>
    </div>
  )
}
