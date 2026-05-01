import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserCircleIcon, BriefcaseIcon } from '@heroicons/react/24/outline'
import { api, type PublicView } from '../lib/api'
import { useAuth } from '../lib/auth'
import logoUrl from '../assets/logo.svg'

type Mode = 'gate' | 'client'

const CLIENT_CHOICE_KEY = (token: string) => `client-mode:${token}`

/**
 * /c/:token — single entry the share link points at.
 *
 * Two-button gate: «Я клиент» renders the read-only proposal,
 * «Я сотрудник» bounces to /p/:id (already authed) or /login (then back).
 *
 * The client choice is persisted in localStorage scoped to the token, so
 * a returning client lands straight into the proposal.
 */
export function ClientView() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { state: authState, user } = useAuth()
  const [data, setData] = useState<PublicView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(CLIENT_CHOICE_KEY(token)) === '1' ? 'client' : 'gate'
    } catch {
      return 'gate'
    }
  })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.getPublic(token)
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [token])

  function chooseClient() {
    try { localStorage.setItem(CLIENT_CHOICE_KEY(token), '1') } catch { /* ignore */ }
    setMode('client')
  }

  function chooseStaff() {
    if (authState.status === 'loading') return
    const proposalId = data?.proposal.id
    if (user && proposalId) {
      navigate(`/p/${proposalId}`)
      return
    }
    if (user) {
      navigate('/')
      return
    }
    const returnTo = proposalId ? `/p/${proposalId}` : '/'
    navigate(`/login?return=${encodeURIComponent(returnTo)}`)
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
        <div className="max-w-md p-8 bg-white border border-[var(--color-border)] rounded-2xl text-center">
          <div className="text-[16px] font-semibold mb-2">КП не найдено</div>
          <p className="text-[13px] text-[var(--color-muted)]">
            Ссылка устарела или была отозвана. Попроси отправителя поделиться новой.
          </p>
        </div>
      </main>
    )
  }

  if (mode === 'gate') {
    return <Gate proposalName={data?.proposal.name} onClient={chooseClient} onStaff={chooseStaff} />
  }

  return <ClientReadView data={data} />
}

function Gate({
  proposalName,
  onClient,
  onStaff,
}: {
  proposalName?: string
  onClient: () => void
  onStaff: () => void
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="uxart" className="h-8 w-auto mx-auto mb-6" />
          <h1 className="text-[22px] font-semibold leading-tight">
            {proposalName ? `КП «${proposalName}»` : 'Коммерческое предложение'}
          </h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-1.5">
            Как открыть документ?
          </p>
        </div>

        <div className="grid gap-3">
          <ChoiceCard
            icon={<UserCircleIcon className="w-6 h-6" />}
            title="Я клиент"
            description="Открыть КП в режиме просмотра — ничего не нужно регистрировать."
            onClick={onClient}
          />
          <ChoiceCard
            icon={<BriefcaseIcon className="w-6 h-6" />}
            title="Я сотрудник"
            description="Перейти к редактированию. Если не залогинен — войду или создам аккаунт."
            onClick={onStaff}
          />
        </div>
      </div>
    </main>
  )
}

function ChoiceCard({
  icon, title, description, onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-[var(--color-border)] rounded-2xl p-5 flex items-start gap-4 hover:border-[#202020] transition-colors cursor-pointer"
    >
      <span className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-row-even)] text-[#202020] flex items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-[#202020]">{title}</span>
        <span className="block text-[13px] text-[var(--color-muted)] mt-1 leading-relaxed">
          {description}
        </span>
      </span>
    </button>
  )
}

/**
 * Phase-4 minimum: read-only metadata. Real render with optional toggles
 * and XLSX download lands next; this stub at least confirms the gate
 * forwards correctly and the public endpoint is reachable.
 */
function ClientReadView({ data }: { data: PublicView | null }) {
  const subtitle = useMemo(() => {
    if (!data) return null
    const sectionCount = data.proposal.state.sections.length
    return `${sectionCount} ${pluralize(sectionCount, 'раздел', 'раздела', 'разделов')}`
  }, [data])

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <header className="bg-white border-b border-[var(--color-border)] px-8 h-12 flex items-center">
        <img src={logoUrl} alt="uxart" className="h-6 w-auto" />
        <div className="ml-6 min-w-0">
          <div className="text-[14px] font-semibold truncate">{data.proposal.name}</div>
          {subtitle && <div className="text-[11px] text-[var(--color-muted)]">{subtitle}</div>}
        </div>
      </header>
      <div className="px-8 py-8 max-w-[880px] mx-auto">
        <div className="text-[13px] text-[var(--color-muted)]">
          Read-only render будет в следующей итерации (таблица оценки, тумблеры
          опциональных разделов, скачать .xlsx). Бэкенд уже отдаёт данные.
        </div>
      </div>
    </main>
  )
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
