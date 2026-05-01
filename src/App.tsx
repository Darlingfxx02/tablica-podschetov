import { useState, useEffect, useRef } from 'react'
import { useStore, createEmptyRole } from './store'
import { EstimateTable } from './components/preview/EstimateTable'
import { RoadmapTable } from './components/preview/RoadmapTable'
import { RoadmapSettingsPanel } from './components/editor/RoadmapSettings'
import { ExportButton } from './components/ExportButton'
import { ImportButton } from './components/ImportButton'
import { TaskForm } from './components/editor/TaskForm'
import { ApprovalPercentControl } from './components/shared/ApprovalPercentControl'
import {
  PencilSquareIcon, PlusIcon, TrashIcon,
  XMarkIcon, LinkIcon, ChevronDownIcon, Bars3Icon,
  CalendarDaysIcon, TableCellsIcon, PuzzlePieceIcon,
} from '@heroicons/react/24/outline'
import { PuzzlePieceIcon as PuzzlePieceSolidIcon } from '@heroicons/react/24/solid'
import { sectionTotalHours, sectionTotalCost, totalRoleHours, grandTotalHours, grandTotalCost, formatNumber } from './lib/calculations'
import { useDragReorder } from './hooks/useDragReorder'
import type { SectionType, Breakpoint } from './types'
import logoUrl from './assets/logo.svg'

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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="relative px-4 py-3 flex items-center gap-4">
          <div className="flex items-end gap-3 flex-1 min-w-0">
            <button
              onClick={() => {
                const tabs: Array<'editor' | 'preview' | 'roadmap'> = ['editor', 'preview', 'roadmap']
                const idx = tabs.indexOf(activeTab)
                setActiveTab(tabs[(idx + 1) % tabs.length])
              }}
              className="shrink-0 p-1 -m-1 text-gray-400 hover:text-dark transition-colors cursor-pointer rounded-lg hover:bg-gray-100"
              title="Переключить раздел"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
            <img src={logoUrl} alt="uxart" className="h-7 w-auto shrink-0" />
            <input
              type="text"
              value={state.projectName}
              onChange={e => dispatch({ type: 'SET_PROJECT_NAME', name: e.target.value })}
              className="text-sm font-medium text-gray-500 bg-transparent border-none outline-none focus:ring-0 min-w-0 flex-1 leading-none pb-0.5"
            />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'editor' ? 'bg-white shadow-sm text-dark' : 'text-gray-500'
              }`}
            >
              <PencilSquareIcon className="w-4 h-4" />
              Редактор
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'preview' ? 'bg-white shadow-sm text-dark' : 'text-gray-500'
              }`}
            >
              <TableCellsIcon className="w-4 h-4" />
              Оценка
            </button>
            <button
              onClick={() => setActiveTab('roadmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'roadmap' ? 'bg-white shadow-sm text-dark' : 'text-gray-500'
              }`}
            >
              <CalendarDaysIcon className="w-4 h-4" />
              Дорожная карта
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ImportButton />
            <ExportButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'editor' && (
          <div className="flex flex-col h-full">
            {/* Sidebar + Content */}
            <div className="flex flex-1 min-h-0">
              {/* Sidebar */}
              <aside
                className="w-64 min-w-64 bg-gray-50 border-r border-gray-200 flex flex-col overflow-y-auto overscroll-contain"
              >
                <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-400 tracking-wide">блоки работ</span>
                  <AddSectionDropdown onAdd={type => dispatch({ type: 'ADD_SECTION', sectionType: type })} />
                </div>
                <nav className="flex-1 px-2 pb-2 space-y-0.5">
                  {state.sections.map((section) => {
                    return (
                      <div
                        key={section.id}
                        ref={sectionDrag.itemRef(section.id)}
                        {...sectionDrag.dragHandleProps(section.id)}
                        className={`group relative flex items-center gap-1 px-3 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing select-none border font-medium ${
                          resolvedActiveSectionId === section.id
                            ? 'bg-white border-gray-200 text-dark'
                            : 'border-transparent text-gray-600 hover:text-dark'
                        } ${sectionDrag.draggingId === section.id ? 'opacity-0 pointer-events-none' : ''}`}
                        onClick={() => setActiveSectionId(section.id)}
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
                              section.linkBroken
                                ? 'text-gray-300 hover:text-gray-400'
                                : 'text-indigo-500 hover:text-indigo-600'
                            }`}
                          >
                            <LinkIcon className="w-4 h-4" />
                          </button>
                        )}
                        <span className="flex-1 truncate">{section.name || 'Без названия'}</span>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_SECTION_OPTIONAL', id: section.id }) }}
                          title={section.optional ? 'Опциональный раздел — клиент сможет отключить' : 'Сделать опциональным (клиент сможет отключить)'}
                          className={`shrink-0 p-0.5 transition-colors cursor-pointer ${
                            section.optional
                              ? 'text-indigo-500 hover:text-indigo-600'
                              : 'text-gray-300 hover:text-indigo-500 hidden group-hover:flex'
                          }`}
                        >
                          {section.optional
                            ? <PuzzlePieceSolidIcon className="w-4 h-4" />
                            : <PuzzlePieceIcon className="w-4 h-4" />}
                        </button>
                        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                          {sectionTotalHours(section)}ч
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVE_SECTION', id: section.id }) }}
                          className="hidden group-hover:flex p-0.5 text-gray-400 hover:text-red-500 cursor-pointer shrink-0"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                  {state.sections.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs">
                      Нажмите "Добавить"
                    </div>
                  )}
                </nav>
                {state.sections.length > 0 && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-200 mt-auto">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-gray-400 tracking-wide">итого по проекту</span>
                      <span className="text-sm text-gray-400">{grandTotalHours(state)} ч</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base font-bold text-dark">{formatNumber(grandTotalCost(state))}</span>
                      <span className="text-xs text-gray-400">руб.</span>
                    </div>
                  </div>
                )}
              </aside>

              {/* Main content area */}
              <main className="flex-1 overflow-y-auto overscroll-contain bg-white">
                <div>
                  {/* Roles strip — global, separate from work blocks */}
                  <div className="sticky top-0 z-10 bg-white border-b border-r border-gray-200 px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setRolesCollapsed(v => !v)}
                      className={`flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer select-none leading-none ${rolesCollapsed ? '' : 'mb-3'}`}
                    >
                      <span className="text-sm font-semibold text-gray-600 tabular-nums">{state.roles.length}</span>
                      <h3 className="text-sm text-gray-400 tracking-wide">{pluralizeSpecialists(state.roles.length)}</h3>
                      <ChevronDownIcon
                        className={`w-4 h-4 text-gray-400 transition-transform ${rolesCollapsed ? '-rotate-90' : ''}`}
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
                              className={`bg-white border border-gray-200 rounded-xl px-3.5 py-3 min-w-[180px] flex-1 max-w-[240px] hover:border-indigo-300 cursor-grab active:cursor-grabbing ${
                                roleDrag.draggingId === role.id ? 'opacity-0 pointer-events-none' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: role.color }}
                                  />
                                  <span className="text-sm font-semibold text-dark leading-tight truncate">
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
                                  <span className="text-lg font-bold text-dark leading-none">
                                    {hours}
                                  </span>
                                  <span className="text-[10px] text-gray-400">часов</span>
                                </div>
                                <div className="text-[10px] text-gray-400">
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

                  {activeSection ? (
                    <div className="max-w-3xl mx-auto p-6 space-y-4">
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
                        <span className="text-sm text-gray-400">
                          {sectionTotalHours(activeSection)} ч / {formatNumber(sectionTotalCost(activeSection, state.roles))} руб.
                        </span>
                      </div>
                      {activeSection.linkedGroupId && !activeSection.linkBroken && (
                        <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                          Задачи этого блока синхронизированы со связанным блоком — при добавлении, удалении или переименовании задачи они изменяются одновременно в обоих.
                        </div>
                      )}
                      <div className="border-t border-gray-100" />

                      {/* Breakpoint toggles for adaptive sections */}
                      {activeSection.sectionType === 'adaptive' && (
                        <div className="space-y-2">
                          <div className="text-sm text-gray-400 tracking-wide">брейкпоинты</div>
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
                                      ? 'bg-dark text-white border-dark'
                                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-dark'
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
                        <>
                          {/* Tasks */}
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
                        </>
                      )}

                      {activeSection.sectionType !== 'adaptive' && activeSection.sectionType !== 'approval' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => dispatch({ type: 'ADD_TASK', sectionId: activeSection.id })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-gray-500 hover:text-dark border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-all cursor-pointer"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Задачу
                          </button>
                          <button
                            onClick={() => dispatch({ type: 'ADD_DIVIDER', sectionId: activeSection.id })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-gray-500 hover:text-dark border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-all cursor-pointer"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Дивайдер группы
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                      Выберите или создайте блок работ
                    </div>
                  )}
                </div>
              </main>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <main className="h-full overflow-auto p-4 lg:p-6 bg-gray-50">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6 overflow-x-auto">
              <EstimateTable />
            </div>
          </main>
        )}

        {activeTab === 'roadmap' && (
          <div className="flex flex-col h-full">
            <RoadmapSettingsPanel />
            <main className="flex-1 min-h-0 pt-4 px-4 lg:pt-6 lg:px-6 bg-gray-50">
              <div className="bg-white rounded-t-xl shadow-sm border border-gray-200 border-b-0 h-full pt-4 px-4 lg:pt-5 lg:px-5 overflow-hidden">
                <div className="h-full overflow-auto">
                  <RoadmapTable />
                </div>
              </div>
            </main>
          </div>
        )}
      </div>

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
    </div>
  )
}

export default App
