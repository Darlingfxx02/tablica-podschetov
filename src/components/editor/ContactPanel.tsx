import { useStore } from '../../store'

export function ContactPanel() {
  const { state, dispatch } = useStore()
  const text = state.contact.lines.join('\n')

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Контактная информация</h3>
      <textarea
        value={text}
        onChange={e => dispatch({ type: 'SET_CONTACT', lines: e.target.value.split('\n') })}
        placeholder={"tg: @username\nemail@example.com\nwebsite.ru"}
        rows={3}
        className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all resize-y"
      />
    </div>
  )
}
