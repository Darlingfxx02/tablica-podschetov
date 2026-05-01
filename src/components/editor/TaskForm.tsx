import { PlusIcon } from '@heroicons/react/24/outline'
import { PuzzlePieceIcon as PuzzlePieceSolidIcon, TrashIcon } from '@heroicons/react/24/solid'
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
            onClick={() => dispatch({ type: 'ADD_TASK', sectionId, afterTaskId: task.id })}
            title="Добавить задачу в группу"
            className="shrink-0 p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
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
        <input
          type="text"
          value={task.title}
          onChange={e => updateField({ title: e.target.value })}
          placeholder="Название задачи"
          className="w-full text-base font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-400 placeholder:font-semibold px-0.5"
        />

        {/* Description row */}
        <div className="mt-1">
          <textarea
            value={task.description}
            onChange={e => updateField({ description: e.target.value })}
            placeholder="Описание (необязательно)"
            rows={1}
            className="field-sizing-content w-full text-sm px-3 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all resize-none"
          />
        </div>

        {/* Controls row: hours (start), optional + trash (end) */}
        <div className="mt-0.5 flex items-center gap-1.5">
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
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_TASK_OPTIONAL', sectionId, taskId: task.id })}
            title={task.optional ? 'Клиент сможет отключить эту задачу' : 'Сделать задачу отключаемой клиентом'}
            className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
              task.optional
                ? 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-500'
            }`}
          >
            <PuzzlePieceSolidIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch({ type: 'REMOVE_TASK', sectionId, taskId: task.id })}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-400 hover:bg-[#fbe4e4] hover:text-red-400 transition-colors cursor-pointer"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
