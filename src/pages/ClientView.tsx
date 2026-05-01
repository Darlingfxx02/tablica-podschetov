import { useParams } from 'react-router-dom'

/**
 * Read-only client view at /c/:token. Phase 4 will build out the actual
 * rendering with optional toggles, recompute, and XLSX download. For now
 * it's a placeholder so the route exists and tokens can be tested.
 */
export function ClientView() {
  const { token } = useParams<{ token: string }>()
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md p-8 bg-white rounded-2xl shadow-sm border border-[var(--color-border)]">
        <h1 className="text-[var(--text-excel-14)] font-semibold mb-2">Клиентский view</h1>
        <p className="text-[var(--text-excel-10)] text-[var(--color-muted)] mb-3">
          Будет построен в Фазе 4: read-only просмотр КП с тумблерами на опциональных
          разделах и кнопкой скачать XLSX.
        </p>
        <code className="text-[var(--text-excel-9)] block bg-[var(--color-row-even)] px-2 py-1 rounded">
          token: {token}
        </code>
      </div>
    </div>
  )
}
