import { useState } from 'react'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useStore } from '../../store'
import { TaskForm } from './TaskForm'
import { sectionTotalHours, sectionTotalCost, formatNumber } from '../../lib/calculations'

export function SectionsList() {
  const { state, dispatch } = useStore()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  function toggleCollapsed(id: string) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Блоки работ</h3>
        <button
          onClick={() => dispatch({ type: 'ADD_SECTION' })}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          Добавить блок
        </button>
      </div>

      {state.sections.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Нажмите "Добавить блок", чтобы начать
        </div>
      )}

      {state.sections.map((section, sIdx) => {
        const isCollapsed = collapsed[section.id]
        return (
          <div key={section.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 p-3 bg-gray-100">
              <button
                onClick={() => toggleCollapsed(section.id)}
                className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <ChevronRightIcon className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
              </button>
              <input
                type="text"
                value={section.name}
                onChange={e => dispatch({ type: 'UPDATE_SECTION_NAME', id: section.id, name: e.target.value })}
                className="flex-1 text-sm font-semibold bg-transparent border-none outline-none focus:ring-0"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {sectionTotalHours(section)} ч / {formatNumber(sectionTotalCost(section, state.roles))} руб.
              </span>
              <div className="flex gap-0.5">
                <button
                  onClick={() => dispatch({ type: 'MOVE_SECTION', id: section.id, direction: 'up' })}
                  disabled={sIdx === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => dispatch({ type: 'MOVE_SECTION', id: section.id, direction: 'down' })}
                  disabled={sIdx === state.sections.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => dispatch({ type: 'REMOVE_SECTION', id: section.id })}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>

            {!isCollapsed && (
              <div className="p-3 pl-8 space-y-2">
                {section.tasks.map(task => (
                  <TaskForm
                    key={task.id}
                    sectionId={section.id}
                    task={task}
                  />
                ))}
                <button
                  onClick={() => dispatch({ type: 'ADD_TASK', sectionId: section.id })}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg transition-all cursor-pointer"
                >
                  <PlusIcon className="w-4 h-4" />
                  Добавить задачу
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
