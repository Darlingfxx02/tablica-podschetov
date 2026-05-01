import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import logoUrl from '../assets/logo.svg'

type Mode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('return') || '/'
  const initialMode: Mode = params.get('mode') === 'register' ? 'register' : 'login'

  const { state, login, register } = useAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already authed → fly straight to wherever the user was headed.
  useEffect(() => {
    if (state.status === 'authed') navigate(returnTo, { replace: true })
  }, [state.status, returnTo, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading' || state.status === 'authed') {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
      <div className="w-full max-w-[400px]">
        <Link to="/" className="block mb-8 text-center" title="К проектам">
          <img src={logoUrl} alt="uxart" className="h-8 w-auto mx-auto" />
        </Link>

        <div className="bg-white border border-[var(--color-border)] rounded-2xl p-8">
          <h1 className="text-[20px] font-semibold mb-1">
            {mode === 'login' ? 'Вход' : 'Регистрация'}
          </h1>
          <p className="text-[13px] text-[var(--color-muted)] mb-6">
            {mode === 'login'
              ? 'Войдите, чтобы редактировать КП.'
              : 'Создайте аккаунт сотрудника UX Art.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              required
            />
            <Field
              label="Пароль"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={setPassword}
              required
            />

            {error && (
              <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-[#202020] text-white text-[14px] font-medium hover:bg-black transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy ? '…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[var(--color-border)] text-[13px] text-[var(--color-muted)] text-center">
            {mode === 'login' ? (
              <>
                Нет аккаунта?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null) }}
                  className="text-[#202020] font-medium hover:underline"
                >
                  Создать
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null) }}
                  className="text-[#202020] font-medium hover:underline"
                >
                  Войти
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function Field({
  label, type, value, onChange, autoComplete, required,
}: {
  label: string
  type: 'email' | 'password'
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-[var(--color-muted)] font-medium block mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-white text-[14px] focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/15 outline-none transition-colors"
      />
    </label>
  )
}
