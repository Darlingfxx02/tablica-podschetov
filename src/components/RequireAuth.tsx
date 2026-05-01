import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Wrap protected routes. Loading → spinner-ish. Guest → redirect to /login,
 * with the original URL in `?return=` so we come back after auth.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  if (state.status === 'guest') {
    const from = location.pathname + location.search
    return <Navigate to={`/login?return=${encodeURIComponent(from)}`} replace />
  }

  return <>{children}</>
}
