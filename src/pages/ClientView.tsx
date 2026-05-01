import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserCircleIcon, BriefcaseIcon } from '@heroicons/react/24/outline'
import { api, type ClientSelections, type PublicView } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ReadOnlyStoreProvider } from '../store'
import { EstimateTable } from '../components/preview/EstimateTable'
import type { ProjectEstimate } from '../types'
import logoUrl from '../assets/logo.svg'

type Mode = 'gate' | 'client'

/**
 * /c/:token — single entry the share link points at.
 *
 * The gate is always shown: even an authed staff member who opens the
 * share link gets the choice (so they can preview what their client
 * sees). «Я клиент» → read-only preview. «Я сотрудник» → /p/:id when
 * already authed, otherwise /login with a return back to /p/:id.
 */
export function ClientView() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { state: authState } = useAuth()
  const [data, setData] = useState<PublicView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('gate')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.getPublic(token)
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [token])

  function chooseClient() {
    setMode('client')
  }

  function chooseStaff() {
    const proposalId = data?.proposal.id
    const returnTo = proposalId ? `/p/${proposalId}` : '/'
    if (authState.status === 'authed') {
      navigate(returnTo)
      return
    }
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

  // While we don't know the auth state (or we know it's authed and are
  // about to redirect to the editor), show a quiet loader instead of
  // flashing the gate.
  const willRedirectToEditor = authState.status === 'authed'
  if (authState.status === 'loading' || willRedirectToEditor) {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  if (mode === 'gate') {
    return <Gate proposalName={data?.proposal.name} onClient={chooseClient} onStaff={chooseStaff} />
  }

  return <ClientReadView data={data} token={token} />
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
            onClick={onClient}
          />
          <ChoiceCard
            icon={<BriefcaseIcon className="w-6 h-6" />}
            title="Я сотрудник"
            onClick={onStaff}
          />
        </div>
      </div>
    </main>
  )
}

function ChoiceCard({
  icon, title, onClick,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-[var(--color-border)] rounded-2xl p-5 flex items-center gap-4 hover:border-[#202020] transition-colors cursor-pointer"
    >
      <span className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-row-even)] text-[#202020] flex items-center justify-center">
        {icon}
      </span>
      <span className="block text-[15px] font-semibold text-[#202020]">{title}</span>
    </button>
  )
}

/**
 * Read-only render of the proposal. Optional sections show as toggles
 * the client can flip — disabled ones drop out of the totals because
 * EstimateTable already filters !s.disabled. Selections persist to the
 * server (debounced) so the seller can see what the client picked.
 */
function ClientReadView({ data, token }: { data: PublicView | null; token: string }) {
  // sectionId → enabled. Missing means "use proposal default" (enabled
  // unless staff disabled it). False from server means client unchecked.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const initialized = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate overrides from server-saved selections on first data arrival.
  useEffect(() => {
    if (!data || initialized.current) return
    initialized.current = true
    setOverrides({ ...data.selections.sections })
  }, [data])

  // Debounced save back to server when overrides change. Skip the very
  // first effect run (after hydration above) to avoid bouncing the same
  // selections back to the server.
  const saveSeq = useRef(0)
  useEffect(() => {
    if (!initialized.current) return
    saveSeq.current += 1
    const seq = saveSeq.current
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (seq !== saveSeq.current) return
      const selections: ClientSelections = { sections: overrides, tasks: {} }
      api.saveSelections(token, selections).catch(() => { /* offline, retry on next change */ })
    }, 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [overrides, token])

  // Apply client toggles on top of the proposal: an optional section the
  // client unchecked becomes effectively disabled.
  const effectiveState: ProjectEstimate | null = useMemo(() => {
    if (!data) return null
    return {
      ...data.proposal.state,
      sections: data.proposal.state.sections.map(s => {
        if (!s.optional) return s
        const explicit = overrides[s.id]
        if (explicit === false) return { ...s, disabled: true }
        return { ...s, disabled: false }
      }),
    }
  }, [data, overrides])

  const optionalSections = useMemo(() => {
    if (!data) return []
    return data.proposal.state.sections.filter(s => s.optional)
  }, [data])

  if (!data || !effectiveState) {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  function isOn(sectionId: string): boolean {
    const explicit = overrides[sectionId]
    if (explicit === false) return false
    return true
  }

  return (
    <ReadOnlyStoreProvider state={effectiveState} proposalId={data.proposal.id}>
      <main className="min-h-screen bg-[#f5f5f5] flex flex-col">
        <header className="bg-white border-b border-[var(--color-border)] px-8 h-12 flex items-center sticky top-0 z-10">
          <img src={logoUrl} alt="uxart" className="h-6 w-auto" />
          <div className="ml-6 min-w-0">
            <div className="text-[14px] font-semibold truncate">{data.proposal.name}</div>
          </div>
        </header>

        <div className="flex-1 px-4 md:px-8 py-6 space-y-5">
          {optionalSections.length > 0 && (
            <section className="max-w-[880px] mx-auto">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mb-2">
                Опциональные разделы
              </div>
              <div className="bg-white border border-[var(--color-border)] rounded-xl p-3 flex flex-wrap gap-2">
                {optionalSections.map(s => {
                  const on = isOn(s.id)
                  return (
                    <label
                      key={s.id}
                      className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border cursor-pointer transition-colors ${
                        on
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-[var(--color-row-even)] border-[var(--color-border)] text-[var(--color-muted)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setOverrides(prev => ({ ...prev, [s.id]: !on }))
                        }
                        className="accent-indigo-500"
                      />
                      <span className="text-[13px] font-medium">{s.name || 'Раздел без названия'}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <div className="bg-white border border-[var(--color-border)] rounded-xl p-4 lg:p-6 overflow-x-auto">
              <EstimateTable />
            </div>
          </section>
        </div>
      </main>
    </ReadOnlyStoreProvider>
  )
}

