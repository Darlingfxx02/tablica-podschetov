/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { SERVER_URL } from '../store'

export interface User {
  id: string
  email: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'authed'; user: User }

interface AuthContextValue {
  state: AuthState
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function url(path: string): string {
  // SERVER_URL is empty in dev (we proxy through Vite) and absolute in prod.
  return SERVER_URL ? `${SERVER_URL}${path}` : path
}

async function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(url(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const refreshing = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const res = await fetch(url('/api/auth/me'), { credentials: 'include' })
      if (res.ok) {
        const user = (await res.json()) as User
        setState({ status: 'authed', user })
      } else {
        setState({ status: 'guest' })
      }
    } catch {
      setState({ status: 'guest' })
    } finally {
      refreshing.current = false
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const res = await postJson('/api/auth/login', { email, password })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Не удалось войти')
    }
    const user = (await res.json()) as User
    setState({ status: 'authed', user })
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const res = await postJson('/api/auth/register', { email, password })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Не удалось зарегистрироваться')
    }
    const user = (await res.json()) as User
    setState({ status: 'authed', user })
  }, [])

  const logout = useCallback(async () => {
    try { await postJson('/api/auth/logout') } catch { /* ignore */ }
    setState({ status: 'guest' })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        state,
        user: state.status === 'authed' ? state.user : null,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
