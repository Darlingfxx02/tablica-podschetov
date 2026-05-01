import { useState, useEffect, useRef } from 'react'
import { useStore, createEmptyRole } from './store'
import { EstimateTable } from './components/preview/EstimateTable'
import { RoadmapTable } from './components/preview/RoadmapTable'
import { RoadmapSettingsPanel } from './components/editor/RoadmapSettings'
import { ExportButton } from './components/ExportButton'
import { ImportButton } from './components/ImportButton'
import { TaskForm } from './components/editor/TaskForm'
import { ApprovalPercentControl } from './components/shared/ApprovalPercentControl'
import { BrandHeader } from './components/BrandHeader'
import {
  PencilSquareIcon, PlusIcon, TrashIcon,
  XMarkIcon, LinkIcon, ChevronDownIcon,
  CalendarDaysIcon, TableCellsIcon, PuzzlePieceIcon,
} from '@heroicons/react/24/outline'
import { PuzzlePieceIcon as PuzzlePieceSolidIcon } from '@heroicons/react/24/solid'
import { sectionTotalHours, sectionTotalCost, totalRoleHours, grandTotalHours, grandTotalCost, formatNumber } from './lib/calculations'
import { useDragReorder } from './hooks/useDragReorder'
import { useUiSettings } from './lib/uiSettings'
import type { SectionType, Breakpoint } from './types'

function pluralizeSpecialists(n: number): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'специалистов'
  if (mod10 === 1) return 'специалист'
  if (mod10 >= 2 && mod10 <= 4) return 'специалиста'
  return 'специалистов'
}

const SECTION_TYPE_OPTIONS: { type: SectionType; label: string; hint: string }[] = [
  { type: 'design', label: 'Дизайн', hint: 'Добавит пару: Проектирование + Дизайн' },
  { type: 'prototyping', label: 'Прототипирование', hint: 'Добавит пару: Проектирование + Прототипирование' },
  { type: 'adaptive', label: 'Адаптивы', hint: 'Блок с переключателями брейкпоинтов' },
  { type: 'approval', label: 'Согласование и правки', hint: 'Авто-расчёт по % от общего времени (настраивается)' },
  { type: 'custom', label: 'Свой блок', hint: 'Пустой блок произвольного типа' },
]

const BREAKPOINT_OPTIONS: { value: Breakpoint; label: string }[] = [
  { value: 'desktop', label: 'Десктоп' },
  { value: 'tablet', label: 'Планшет' },
  { value: 'mobile', label: 'Мобилка' },
]

function AddSectionDropdown({ onAdd }: { onAdd: (type: SectionType) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 256
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width))
      setPos({ top: rect.bottom + 4, left })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Добавить блок"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-dark hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <PlusIcon className="w-4 h-4" />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 256 }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden"
        >
          {SECTION_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.type}
              onClick={() => { onAdd(opt.type); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <div className="text-sm font-medium text-dark">{opt.label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function App() {
  const { state, dispatch } = useStore()
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'roadmap'>('editor')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [rolesCollapsed, setRolesCollapsed] = useState(false)
  const [sectionMenu, setSectionMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const { settings: uiSettings } = useUiSettings()

  useEffect(() => {
    if (!sectionMenu) return
    function onDown() { setSectionMenu(null) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setSectionMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sectionMenu])
  const resolvedActiveSectionId = activeSectionId && state.sections.some(s => s.id === activeSectionId)
    ? activeSectionId
    : state.sections[0]?.id ?? null

  const sectionDrag = useDragReorder({
    onReorder: (fromId, toId) => dispatch({ type: 'REORDER_SECTION', fromId, toId }),
  })
  const roleDrag = useDragReorder({
    onReorder: (fromId, toId) => dispatch({ type: 'REORDER_ROLE', fromId, toId }),
  })
  const taskDrag = useDragReorder({
    onReorder: (fromId, toId) => {
      if (resolvedActiveSectionId) dispatch({ type: 'REORDER_TASK', sectionId: resolvedActiveSectionId, fromId, toId })
    },
  })

  const activeSection = state.sections.find(s => s.id === resolvedActiveSectionId) || null
  const editingRole = state.roles.find(r => r.id === editingRoleId) || null

  const TabButton = ({ tab, icon, label }: { tab: 'editor' | 'preview' | 'roadmap'; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all cursor-pointer ${
        activeTab === tab ? 'bg-white shadow-sm text-dark' : 'text-[var(--color-muted)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="h-screen flex bg-[#f5f5f5] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 bg-white border-r border-[var(--color-border)] flex flex-col overflow-hidden">
        <BrandHeader />

        <div className="px-3 pt-2 pb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-medium px-2">Блоки работ</span>
          <AddSectionDropdown onAdd={type => dispatch({ type: 'ADD_SECTION', sectionType: type })} />
        </div>
        <nav className="flex-1 px-2 pb-2 space-y-0.5 overflow-y-auto overscroll-contain">
          {state.sections.map((section) => {
            const isActive = resolvedActiveSectionId === section.id
            return (
              <div
                key={section.id}
                ref={sectionDrag.itemRef(section.id)}
                {...sectionDrag.dragHandleProps(section.id)}
                className={`relative flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] cursor-grab active:cursor-grabbing select-none transition-colors ${
                  isActive
                    ? 'bg-[#202020] text-white'
                    : 'text-[#202020] hover:bg-[var(--color-row-even)]'
                } ${sectionDrag.draggingId === section.id ? 'opacity-0 pointer-events-none' : ''}`}
                onClick={() => setActiveSectionId(section.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setActiveSectionId(section.id)
                  setSectionMenu({ id: section.id, x: e.clientX, y: e.clientY })
                }}
              >
                {section.linkedGroupId && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      dispatch({ type: 'TOGGLE_SECTION_LINK', id: section.id })
                    }}
                    title={section.linkBroken ? 'Связь разорвана — нажмите, чтобы снова синхронизировать' : 'Блоки синхронизированы — нажмите, чтобы разорвать связь'}
                    className={`shrink-0 p-0.5 -m-0.5 rounded transition-colors cursor-pointer ${
                      isActive
                        ? section.linkBroken
                          ? 'text-white/30 hover:text-white/50'
                          : 'text-indigo-300 hover:text-indigo-200'
                        : section.linkBroken
                          ? 'text-gray-300 hover:text-gray-400'
                          : 'text-indigo-500 hover:text-indigo-600'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                )}
                <span className="flex-1 truncate">{section.name || 'Без названия'}</span>
                {section.optional && (
                  uiSettings.optionalDisplay === 'pill'
                    ? (
                      <span
                        className={`shrink-0 inline-flex items-center px-1.5 h-5 rounded text-[10px] font-bold leading-none tracking-wide border ${
                          isActive
                            ? 'bg-white/10 text-white border-white/20'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                        title="Клиент сможет отключить этот раздел"
                      >
                        опца
                      </span>
                    )
                    : (
                      <PuzzlePieceSolidIcon
                        className={`shrink-0 w-4 h-4 ${isActive ? 'text-indigo-300' : 'text-indigo-500'}`}
                        aria-label="Клиент сможет отключить этот раздел"
                      />
                    )
                )}
                <span className={`text-xs shrink-0 tabular-nums ${isActive ? 'text-white/60' : 'text-[var(--color-muted)]'}`}>
                  {sectionTotalHours(section)}ч
                </span>
              </div>
            )
          })}
          {state.sections.length === 0 && (
            <div className="text-center py-8 text-[var(--color-muted)] text-xs">
              Нажмите «Добавить»
            </div>
          )}
        </nav>
        {state.sections.length > 0 && (
          <div className="p-3 border-t border-[var(--color-border)] mt-auto">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-medium">Итого</span>
              <span className="text-[12px] text-[var(--color-muted)] tabular-nums">{grandTotalHours(state)} ч</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-[16px] font-bold text-[#202020] tabular-nums">{formatNumber(grandTotalCost(state))}</span>
              <span className="text-xs text-[var(--color-muted)]">руб.</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main canvas */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Page header */}
        <header className="relative bg-white border-b border-[var(--color-border)] flex items-center gap-4 px-8 h-12">
          <input
            type="text"
            value={state.projectName}
            onChange={e => dispatch({ type: 'SET_PROJECT_NAME', name: e.target.value })}
            placeholder="Без имени"
            className="text-[14px] font-medium text-[#202020] bg-transparent border-none outline-none focus:ring-0 min-w-0 flex-1 leading-none"
          />
          <div className="absolute left-1/2 -translate-x-1/2 flex bg-[var(--color-row-even)] rounded-lg p-0.5">
            <TabButton tab="editor" icon={<PencilSquareIcon className="w-4 h-4" />} label="Редактор" />
            <TabButton tab="preview" icon={<TableCellsIcon className="w-4 h-4" />} label="Оценка" />
            <TabButton tab="roadmap" icon={<CalendarDaysIcon className="w-4 h-4" />} label="Дорожная карта" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ImportButton />
            <ExportButton />
          </div>
        </header>

        {/* Canvas content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {activeTab === 'editor' && (
            <div className="px-4 md:px-8 py-6">
              <div className="max-w-[880px] mx-auto space-y-8">
              {/* Roles strip */}
              <div>
                <button
                  type="button"
                  onClick={() => setRolesCollapsed(v => !v)}
                  className={`flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer select-none leading-none ${rolesCollapsed ? '' : 'mb-3'}`}
                >
                  <span className="text-sm font-semibold text-[#202020] tabular-nums">{state.roles.length}</span>
                  <h3 className="text-sm text-[var(--color-muted)] tracking-wide">{pluralizeSpecialists(state.roles.length)}</h3>
                  <ChevronDownIcon
                    className={`w-4 h-4 text-[var(--color-muted)] transition-transform ${rolesCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>
                <div className={`flex flex-wrap gap-2.5 ${rolesCollapsed ? 'hidden' : ''}`}>
                  {state.roles.map(role => {
                    const hours = totalRoleHours(state, role.id)
                    return (
                      <div
                        key={role.id}
                        ref={roleDrag.itemRef(role.id)}
                        {...roleDrag.dragHandleProps(role.id)}
                        onClick={() => setEditingRoleId(role.id)}
                        className={`bg-white border border-gray-100/80 rounded-xl px-3.5 py-3 min-w-[180px] flex-1 max-w-[240px] cursor-grab active:cursor-grabbing ${
                          roleDrag.draggingId === role.id ? 'opacity-0 pointer-events-none' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: role.color }}
                            />
                            <span className="text-sm font-semibold text-[#202020] leading-tight truncate">
                              {role.title || 'Без названия'}
                            </span>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              dispatch({ type: 'REMOVE_ROLE', id: role.id })
                            }}
                            className="shrink-0 -mt-1 -mr-1 p-1 text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                            title="Удалить специалиста"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-col gap-0.5">
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-[#202020] leading-none">
                              {hours}
                            </span>
                            <span className="text-[10px] text-[var(--color-muted)]">часов</span>
                          </div>
                          <div className="text-[10px] text-[var(--color-muted)]">
                            {formatNumber(role.hourlyRate)} ₽/час
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => {
                      const role = createEmptyRole(state.roles)
                      setEditingRoleId(role.id)
                      dispatch({ type: 'ADD_ROLE', role })
                    }}
                    className="group bg-transparent border border-dashed border-gray-300 rounded-xl px-3.5 py-3 min-w-[180px] flex-1 max-w-[240px] flex items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer"
                    title="Добавить специалиста"
                  >
                    <PlusIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Active section */}
              {activeSection ? (
                <div className="space-y-4">
                  {/* Section header */}
                  <div className="flex items-center gap-3">
                    {activeSection.linkedGroupId && (
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({ type: 'TOGGLE_SECTION_LINK', id: activeSection.id })
                        }
                        title={activeSection.linkBroken ? 'Связь разорвана — нажмите, чтобы снова синхронизировать' : 'Блоки синхронизированы — нажмите, чтобы разорвать связь'}
                        className={`shrink-0 p-1 -m-1 rounded transition-colors cursor-pointer ${
                          activeSection.linkBroken
                            ? 'text-gray-300 hover:text-gray-400'
                            : 'text-indigo-500 hover:text-indigo-600'
                        }`}
                      >
                        <LinkIcon className="w-5 h-5" />
                      </button>
                    )}
                    <input
                      type="text"
                      value={activeSection.name}
                      onChange={e => dispatch({ type: 'UPDATE_SECTION_NAME', id: activeSection.id, name: e.target.value })}
                      className="text-xl font-semibold bg-transparent border-none outline-none focus:ring-0 flex-1"
                      placeholder="Название блока"
                    />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'TOGGLE_SECTION_OPTIONAL', id: activeSection.id })}
                      title={activeSection.optional ? 'Клиент сможет отключить этот раздел' : 'Сделать раздел отключаемым клиентом'}
                      className={`shrink-0 inline-flex items-center px-2.5 h-7 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
                        activeSection.optional
                          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200'
                          : 'text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 border-gray-200 hover:border-indigo-200'
                      }`}
                    >
                      {activeSection.optional ? 'Опционально' : 'Сделать опциональным'}
                    </button>
                    <span className="text-sm text-[var(--color-muted)] tabular-nums">
                      {sectionTotalHours(activeSection)} ч / {formatNumber(sectionTotalCost(activeSection, state.roles))} руб.
                    </span>
                  </div>
                  {activeSection.linkedGroupId && !activeSection.linkBroken && (
                    <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                      Задачи этого блока синхронизированы со связанным блоком — при добавлении, удалении или переименовании задачи они изменяются одновременно в обоих.
                    </div>
                  )}
                  <div className="border-t border-[var(--color-border)]" />

                  {activeSection.sectionType === 'adaptive' && (
                    <div className="space-y-2">
                      <div className="text-sm text-[var(--color-muted)] tracking-wide">брейкпоинты</div>
                      <div className="flex gap-2">
                        {BREAKPOINT_OPTIONS.map(bp => {
                          const active = (activeSection.breakpoints || []).includes(bp.value)
                          return (
                            <button
                              key={bp.value}
                              onClick={() =>
                                dispatch({
                                  type: 'TOGGLE_BREAKPOINT',
                                  sectionId: activeSection.id,
                                  breakpoint: bp.value,
                                })
                              }
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border ${
                                active
                                  ? 'bg-[#202020] text-white border-[#202020]'
                                  : 'bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:border-gray-400 hover:text-[#202020]'
                              }`}
                            >
                              {bp.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {activeSection.sectionType === 'approval' ? (
                    <ApprovalPercentControl />
                  ) : (
                    <div className="space-y-8">
                      {activeSection.tasks.map(task => (
                        <TaskForm
                          key={task.id}
                          sectionId={activeSection.id}
                          task={task}
                          isDragging={taskDrag.draggingId === task.id}
                          dragHandleProps={taskDrag.dragHandleProps(task.id)}
                          itemRef={taskDrag.itemRef(task.id)}
                        />
                      ))}
                    </div>
                  )}

                  {activeSection.sectionType !== 'adaptive' && activeSection.sectionType !== 'approval' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => dispatch({ type: 'ADD_TASK', sectionId: activeSection.id })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-[var(--color-muted)] hover:text-[#202020] border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-all cursor-pointer"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Задачу
                      </button>
                      <button
                        onClick={() => dispatch({ type: 'ADD_DIVIDER', sectionId: activeSection.id })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-[var(--color-muted)] hover:text-[#202020] border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-all cursor-pointer"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Дивайдер группы
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-[var(--color-muted)] text-sm">
                  Выберите или создайте блок работ
                </div>
              )}
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="px-8 py-6 overflow-x-auto">
              <EstimateTable />
            </div>
          )}

          {activeTab === 'roadmap' && (
            <div className="px-8 py-6 space-y-6">
              <RoadmapSettingsPanel />
              <div className="overflow-auto">
                <RoadmapTable />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Role edit modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRoleId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: editingRole.color }}
                />
                <h2 className="text-lg font-semibold">Специалист</h2>
              </div>
              <button
                onClick={() => setEditingRoleId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Категория</span>
                <input
                  type="text"
                  value={editingRole.category}
                  onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...editingRole, category: e.target.value } })}
                  placeholder="Напр. Проектирование / Дизайн"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Должность</span>
                <input
                  type="text"
                  value={editingRole.title}
                  onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...editingRole, title: e.target.value } })}
                  placeholder="Напр. Middle UX / UI-дизайнер"
                  autoFocus
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Ставка, руб./час</span>
                <input
                  type="number"
                  value={editingRole.hourlyRate || ''}
                  onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...editingRole, hourlyRate: Number(e.target.value) } })}
                  placeholder="0"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
                />
              </label>
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => {
                  dispatch({ type: 'REMOVE_ROLE', id: editingRole.id })
                  setEditingRoleId(null)
                }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
                Удалить
              </button>
              <button
                onClick={() => setEditingRoleId(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {sectionMenu && (() => {
        const section = state.sections.find(s => s.id === sectionMenu.id)
        if (!section) return null
        const MENU_W = 220
        const MENU_H = 92
        const left = Math.min(window.innerWidth - MENU_W - 8, sectionMenu.x)
        const top = Math.min(window.innerHeight - MENU_H - 8, sectionMenu.y)
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden"
            style={{ top, left, width: MENU_W }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'TOGGLE_SECTION_OPTIONAL', id: section.id })
                setSectionMenu(null)
              }}
              className="w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left text-dark hover:bg-gray-100 cursor-pointer"
            >
              <PuzzlePieceIcon className="w-4 h-4 text-gray-400" />
              {section.optional ? 'Сделать обычным' : 'Сделать опциональным'}
            </button>
            <div className="h-px bg-gray-100 mx-2" />
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'REMOVE_SECTION', id: section.id })
                setSectionMenu(null)
              }}
              className="w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left text-red-600 hover:bg-red-50 cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
              Удалить раздел
            </button>
          </div>
        )
      })()}
    </div>
  )
}

export default App
