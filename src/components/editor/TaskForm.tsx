import { useLayoutEffect, useRef } from 'react'
import { TrashIcon } from '@heroicons/react/24/outline'
import { PencilIcon } from '@heroicons/react/24/solid'
import { useStore } from '../../store'
import type { Task } from '../../types'

interface TaskFormProps {
  sectionId: string
  task: Task
  isDragging?: boolean
  dragHandleProps?: { onMouseDown: (e: React.MouseEvent) => void }
  itemRef?: (el: HTMLElement | null) => void
}

export function TaskForm({
  sectionId, task,
  isDragging,
  dragHandleProps, itemRef,
}: TaskFormProps) {
  const { state, dispatch } = useStore()
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const el = descriptionRef.current
    if (!el || task.isDivider) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [task.description, task.isDivider, state.roles.length])

  function updateField(field: Partial<Task>) {
    dispatch({ type: 'UPDATE_TASK', sectionId, task: { ...task, ...field } })
  }

  function setHours(roleId: string, value: string) {
    const hours = { ...task.hours, [roleId]: Number(value) || 0 }
    dispatch({ type: 'UPDATE_TASK', sectionId, task: { ...task, hours } })
  }

  if (task.isDivider) {
    return (
      <div
        ref={itemRef}
        className={`group/drag relative flex items-center gap-0 ${isDragging ? 'opacity-0 pointer-events-none' : ''} `}
      >
        {/* Drag handle: full-height hit area, visual pill inside */}
        <div {...dragHandleProps} className="absolute -left-6 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-10">
          <div className="w-1 h-5 rounded-full bg-gray-300 group-hover/drag:bg-gray-400 opacity-0 group-hover/drag:opacity-100 transition-all" />
        </div>
        <div className="flex-1 flex items-center gap-2 bg-dark rounded-lg px-3 py-2">
          <input
            type="text"
            value={task.title}
            onChange={e => updateField({ title: e.target.value })}
            placeholder="Название группы"
            size={1}
            className="field-sizing-content max-w-full text-sm font-semibold bg-transparent text-white border-none outline-none focus:ring-0 placeholder:text-gray-400 flex-1"
          />
          <button
            onClick={() => dispatch({ type: 'REMOVE_TASK', sectionId, taskId: task.id })}
            className="shrink-0 p-1 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={itemRef}
      className={`group/drag relative flex gap-0 ${isDragging ? 'opacity-0 pointer-events-none' : ''} `}
    >
      {/* Drag handle: full-height hit area, visual pill inside */}
      <div {...dragHandleProps} className="absolute -left-6 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-10">
        <div className="w-1 h-5 rounded-full bg-gray-300 group-hover/drag:bg-gray-400 opacity-0 group-hover/drag:opacity-100 transition-all" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2.5">
          <div className="group flex flex-1 min-w-0 items-center gap-1.5 px-0.5">
            <input
              type="text"
              value={task.title}
              onChange={e => updateField({ title: e.target.value })}
              placeholder="Название задачи"
              className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-400 placeholder:font-semibold"
            />
            <PencilIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_TASK_OPTIONAL', sectionId, taskId: task.id })}
            title={task.optional ? 'Клиент сможет отключить эту задачу' : 'Сделать задачу отключаемой клиентом'}
            className={`shrink-0 inline-flex items-center px-2 h-6 rounded text-[11px] font-medium transition-colors cursor-pointer border ${
              task.optional
                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200'
                : 'text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 border-gray-200 hover:border-indigo-200 opacity-0 group-hover/drag:opacity-100'
            }`}
          >
            {task.optional ? 'Опционально' : 'Сделать опц.'}
          </button>
          <button
            onClick={() => dispatch({ type: 'REMOVE_TASK', sectionId, taskId: task.id })}
            className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Description + hours row */}
        <div className="flex items-start gap-1.5 mt-1">
          <textarea
            ref={descriptionRef}
            value={task.description}
            onChange={e => updateField({ description: e.target.value })}
            placeholder="Описание (необязательно)"
            rows={1}
            className="flex-1 overflow-hidden text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all resize-none"
          />
          <div className="flex gap-1.5 shrink-0 items-start">
            {state.roles.map(role => (
              <div
                key={role.id}
                className="flex items-center justify-center gap-0.5 w-14 h-9 rounded-lg border border-gray-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all"
                style={{ backgroundColor: role.color + '14' }}
                title={role.title}
              >
                <input
                  type="number"
                  min="0"
                  value={task.hours[role.id] || ''}
                  onChange={e => setHours(role.id, e.target.value)}
                  placeholder="0"
                  className="w-7 text-sm text-center bg-transparent border-none outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-xs text-gray-400 leading-none">ч</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
