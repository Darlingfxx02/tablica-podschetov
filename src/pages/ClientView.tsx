import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  UserCircleIcon, BriefcaseIcon,
  TableCellsIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import { api, type ClientSelections, type PublicView } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ReadOnlyStoreProvider } from '../store'
import { EstimateTable } from '../components/preview/EstimateTable'
import { RoadmapTable } from '../components/preview/RoadmapTable'
import { ExportButton } from '../components/ExportButton'
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

type ClientTab = 'estimate' | 'roadmap'

/**
 * Read-only render of the proposal. The client gets the same view the
 * staff sees in Оценка / Дорожная карта tabs plus a download button —
 * the only thing they can't do is edit. Optional sections render as
 * toggles; selections persist to the server (debounced) so the seller
 * sees what the client picked.
 */
function ClientReadView({ data, token }: { data: PublicView | null; token: string }) {
  const [activeTab, setActiveTab] = useState<ClientTab>('estimate')
  // sectionId / taskId → enabled. Missing means "use proposal default"
  // (enabled unless staff disabled it). False from server means client
  // unchecked.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({})
  const initialized = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!data || initialized.current) return
    initialized.current = true
    setOverrides({ ...data.selections.sections })
    setTaskOverrides({ ...data.selections.tasks })
  }, [data])

  const saveSeq = useRef(0)
  useEffect(() => {
    if (!initialized.current) return
    saveSeq.current += 1
    const seq = saveSeq.current
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (seq !== saveSeq.current) return
      const selections: ClientSelections = { sections: overrides, tasks: taskOverrides }
      api.saveSelections(token, selections).catch(() => { /* retry on next edit */ })
    }, 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [overrides, taskOverrides, token])

  const effectiveState: ProjectEstimate | null = useMemo(() => {
    if (!data) return null
    return {
      ...data.proposal.state,
      sections: data.proposal.state.sections.map(s => {
        const tasks = s.tasks.filter(t => !(t.optional && taskOverrides[t.id] === false))
        if (!s.optional) return { ...s, tasks }
        const explicit = overrides[s.id]
        const disabled = explicit === false
        return { ...s, tasks, disabled }
      }),
    }
  }, [data, overrides, taskOverrides])

  // Древесная группировка: каждая секция, у которой есть что-то
  // опциональное (сама секция или её задачи) — корневой узел; её
  // опциональные задачи — ветки. Если у не-опциональной секции нет
  // опциональных задач, она в дерево не попадает.
  const optionalTree = useMemo(() => {
    if (!data) return []
    const out: {
      sectionId: string
      sectionName: string
      sectionOptional: boolean
      tasks: { id: string; title: string }[]
    }[] = []
    for (const s of data.proposal.state.sections) {
      const tasks = s.tasks
        .filter(t => t.optional && !t.isDivider)
        .map(t => ({ id: t.id, title: t.title }))
      if (s.optional || tasks.length > 0) {
        out.push({
          sectionId: s.id,
          sectionName: s.name,
          sectionOptional: !!s.optional,
          tasks,
        })
      }
    }
    return out
  }, [data])

  if (!data || !effectiveState) {
    return (
      <main className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-muted)]">
        Загружаем…
      </main>
    )
  }

  function isSectionOn(sectionId: string): boolean {
    return overrides[sectionId] !== false
  }
  function isTaskOn(taskId: string): boolean {
    return taskOverrides[taskId] !== false
  }

  const hasOptionalToggles = optionalTree.length > 0

  return (
    <ReadOnlyStoreProvider state={effectiveState} proposalId={data.proposal.id}>
      <div className="h-screen flex bg-[#f5f5f5] text-[#202020] overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[260px] shrink-0 bg-white border-r border-[var(--color-border)] flex flex-col overflow-hidden">
          <div className="px-5 pt-6 pb-4 flex items-center">
            <img src={logoUrl} alt="uxart" className="h-7 w-auto" />
          </div>

          {hasOptionalToggles ? (
            <>
              <div className="px-5 pt-2 pb-2">
                <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
                  Дополнительные опции
                </span>
              </div>
              <nav className="flex-1 px-2 pb-2 overflow-y-auto overscroll-contain">
                {optionalTree.map((node, idx) => {
                  const sectionOn = isSectionOn(node.sectionId)
                  return (
                    <div key={node.sectionId} className={idx === 0 ? '' : 'mt-2'}>
                      {node.sectionOptional ? (
                        <ClientOptionRow
                          label={node.sectionName || 'Раздел без названия'}
                          on={sectionOn}
                          onToggle={() =>
                            setOverrides(prev => ({ ...prev, [node.sectionId]: !sectionOn }))
                          }
                        />
                      ) : (
                        <div className="px-3 h-9 flex items-center text-sm font-semibold text-[#202020] truncate">
                          {node.sectionName || 'Раздел без названия'}
                        </div>
                      )}
                      {node.tasks.length > 0 && (
                        <div
                          className={`relative ml-[18px] pl-3 ${
                            node.sectionOptional && !sectionOn ? 'opacity-40' : ''
                          }`}
                        >
                          {/* Вертикальная линия дерева — обрывается на середине последней ветки */}
                          <span
                            aria-hidden
                            className="absolute left-0 top-0 w-px bg-[var(--color-border)]"
                            style={{ height: `calc(100% - 18px)` }}
                          />
                          {node.tasks.map(t => {
                            const on = isTaskOn(t.id)
                            return (
                              <div key={t.id} className="relative">
                                {/* Горизонтальный коннектор «├─» к строке */}
                                <span
                                  aria-hidden
                                  className="absolute left-[-12px] top-[18px] w-3 h-px bg-[var(--color-border)]"
                                />
                                <ClientOptionRow
                                  label={t.title || 'Задача без названия'}
                                  on={on}
                                  onToggle={() =>
                                    setTaskOverrides(prev => ({ ...prev, [t.id]: !on }))
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </>
          ) : (
            <div className="flex-1" />
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <header className="relative bg-white border-b border-[var(--color-border)] flex items-center gap-4 px-8 h-12 shrink-0">
            <div className="text-[14px] font-semibold text-[#202020] truncate min-w-0 flex-1 leading-none">
              {data.proposal.name}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 flex bg-[var(--color-row-even)] rounded-lg p-0.5">
              <ClientTabButton
                tab="estimate"
                active={activeTab === 'estimate'}
                onClick={() => setActiveTab('estimate')}
                icon={<TableCellsIcon className="w-4 h-4" />}
                label="Оценка"
              />
              <ClientTabButton
                tab="roadmap"
                active={activeTab === 'roadmap'}
                onClick={() => setActiveTab('roadmap')}
                icon={<CalendarDaysIcon className="w-4 h-4" />}
                label="Дорожная карта"
              />
            </div>
            <div className="shrink-0">
              <ExportButton />
            </div>
          </header>

          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === 'estimate' && (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-8 py-6">
                <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-hidden">
                  <div className="p-4 lg:p-6 overflow-hidden">
                    <EstimateTable />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roadmap' && (
              <div className="flex-1 min-h-0 flex flex-col px-4 md:px-8 pt-6">
                <div className="bg-white border border-[var(--color-border)] border-b-0 rounded-t-xl overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="px-4 pt-4 lg:px-6 lg:pt-6 flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
                      <RoadmapTable />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </ReadOnlyStoreProvider>
  )
}

function ClientOptionRow({
  label, on, onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full relative flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm text-left text-[#202020] select-none transition-colors hover:bg-[var(--color-row-even)] ${
        on ? '' : 'opacity-50'
      }`}
    >
      <span className="flex-1 truncate font-medium">{label}</span>
      <span
        role="switch"
        aria-checked={on}
        className={`shrink-0 ml-1 relative inline-flex items-center w-7 h-4 rounded-full transition-colors ${
          on ? 'bg-indigo-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
            on ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

function ClientTabButton({
  active, onClick, icon, label,
}: {
  tab: ClientTab
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all cursor-pointer ${
        active ? 'bg-white shadow-sm text-[#202020]' : 'text-[var(--color-muted)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

