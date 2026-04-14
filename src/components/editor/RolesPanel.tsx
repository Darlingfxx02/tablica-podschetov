import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useStore } from '../../store'

export function RolesPanel() {
  const { state, dispatch } = useStore()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Специалисты</h3>
        <button
          onClick={() => dispatch({ type: 'ADD_ROLE' })}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {state.roles.map(role => (
        <div key={role.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={role.category}
                onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...role, category: e.target.value } })}
                placeholder="Категория (напр. Проектирование / Дизайн)"
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
              />
              <input
                type="text"
                value={role.title}
                onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...role, title: e.target.value } })}
                placeholder="Должность (напр. Middle UX / UI-дизайнер)"
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={role.hourlyRate || ''}
                  onChange={e => dispatch({ type: 'UPDATE_ROLE', role: { ...role, hourlyRate: Number(e.target.value) } })}
                  placeholder="Ставка"
                  className="w-28 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
                />
                <span className="text-xs text-gray-400">руб./час</span>
              </div>
            </div>
            <button
              onClick={() => dispatch({ type: 'REMOVE_ROLE', id: role.id })}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
