import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  LinkIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { api, publicShareUrl, type ProposalMeta } from '../lib/api'
import logoUrl from '../assets/logo.svg'

type View = 'active' | 'archive'

export function Dashboard() {
  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [proposals, setProposals] = useState<ProposalMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function refresh() {
    try {
      const list = await api.listProposals(true)
      setProposals(list)
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => { void refresh() }, [])

  const filtered = useMemo(() => {
    if (!proposals) return []
    const isArchived = (p: ProposalMeta) => !!p.archivedAt
    const q = search.trim().toLowerCase()
    return proposals
      .filter(p => view === 'archive' ? isArchived(p) : !isArchived(p))
      .filter(p => !q || p.name.toLowerCase().includes(q))
  }, [proposals, view, search])

  const counts = useMemo(() => {
    if (!proposals) return { active: 0, archive: 0 }
    return proposals.reduce(
      (acc, p) => p.archivedAt ? { ...acc, archive: acc.archive + 1 } : { ...acc, active: acc.active + 1 },
      { active: 0, archive: 0 },
    )
  }, [proposals])

  async function handleCreate() {
    const name = window.prompt('Название КП', 'Новый КП')
    if (!name?.trim()) return
    try {
      const created = await api.createProposal(name.trim())
      navigate(`/p/${created.id}`)
    } catch (err) {
      alert(`Не удалось создать КП: ${err}`)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f5f5f5] text-[#202020]">
      <Sidebar
        view={view}
        onViewChange={setView}
        counts={counts}
        search={search}
        onSearch={setSearch}
        onCreate={handleCreate}
      />
      <main className="flex-1 min-w-0 px-10 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight">
              {view === 'active' ? 'Все КП' : 'Архив'}
            </h1>
            <div className="text-[13px] text-[var(--color-muted)] mt-0.5">
              {filtered.length === 0
                ? (proposals ? 'Пока пусто' : 'Загружаем…')
                : `${filtered.length} ${pluralize(filtered.length, 'КП', 'КП', 'КП')}`}
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-[#202020] text-white text-[14px] font-medium hover:bg-black transition-colors"
          >
            <PlusIcon className="w-4 h-4" /> Создать КП
          </button>
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px]">
            Не удалось загрузить список: {error}
          </div>
        )}

        <ProposalGrid
          proposals={filtered}
          view={view}
          onChanged={refresh}
        />
      </main>
    </div>
  )
}

interface SidebarProps {
  view: View
  onViewChange: (v: View) => void
  counts: { active: number; archive: number }
  search: string
  onSearch: (s: string) => void
  onCreate: () => void
}

function Sidebar({ view, onViewChange, counts, search, onSearch, onCreate }: SidebarProps) {
  return (
    <aside className="w-[260px] shrink-0 border-r border-[var(--color-border)] bg-white flex flex-col">
      <div className="px-5 pt-6 pb-4">
        <img src={logoUrl} alt="uxart" className="h-7 w-auto" />
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск"
            className="w-full h-9 pl-8 pr-3 rounded-lg bg-[var(--color-row-even)] border border-transparent focus:bg-white focus:border-[var(--color-border)] focus:outline-none text-[13px]"
          />
        </div>
      </div>

      <nav className="px-2 flex-1 space-y-0.5">
        <NavItem
          active={view === 'active'}
          onClick={() => onViewChange('active')}
          icon={<Squares2X2Icon className="w-4 h-4" />}
          label="Все КП"
          count={counts.active}
        />
        <NavItem
          active={view === 'archive'}
          onClick={() => onViewChange('archive')}
          icon={<ArchiveBoxIcon className="w-4 h-4" />}
          label="Архив"
          count={counts.archive}
        />
      </nav>

      <div className="p-3 border-t border-[var(--color-border)]">
        <button
          onClick={onCreate}
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-[var(--color-border)] text-[13px] text-[var(--color-muted)] hover:border-[#202020] hover:text-[#202020] transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Новый КП
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  active, onClick, icon, label, count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-[#202020] text-white'
          : 'text-[#202020] hover:bg-[var(--color-row-even)]'
      }`}
    >
      <span className={active ? '' : 'text-[var(--color-muted)]'}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {typeof count === 'number' && (
        <span className={`text-[11px] ${active ? 'text-white/70' : 'text-[var(--color-muted)]'}`}>{count}</span>
      )}
    </button>
  )
}

interface GridProps {
  proposals: ProposalMeta[]
  view: View
  onChanged: () => void
}

function ProposalGrid({ proposals, view, onChanged }: GridProps) {
  if (proposals.length === 0) {
    return (
      <div className="mt-12 grid place-items-center">
        <div className="text-center text-[var(--color-muted)] text-[14px]">
          {view === 'archive' ? 'Архив пуст' : 'Создай первый КП кнопкой справа сверху'}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {proposals.map(p => (
        <ProposalTile key={p.id} proposal={p} view={view} onChanged={onChanged} />
      ))}
    </div>
  )
}

function ProposalTile({
  proposal: p,
  view,
  onChanged,
}: {
  proposal: ProposalMeta
  view: View
  onChanged: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  async function handleRename() {
    const next = window.prompt('Новое название', p.name)
    if (!next?.trim() || next.trim() === p.name) return setMenuOpen(false)
    try {
      await api.renameProposal(p.id, next.trim())
      onChanged()
    } catch (err) {
      alert(`Не удалось переименовать: ${err}`)
    } finally {
      setMenuOpen(false)
    }
  }

  async function handleCopyLink() {
    const url = publicShareUrl(p.publicToken)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Скопируйте ссылку', url)
    }
    setMenuOpen(false)
  }

  async function handleArchive() {
    if (!window.confirm(`Архивировать «${p.name}»?`)) return setMenuOpen(false)
    try {
      await api.archiveProposal(p.id)
      onChanged()
    } catch (err) {
      alert(`Не удалось архивировать: ${err}`)
    } finally {
      setMenuOpen(false)
    }
  }

  async function handleRestore() {
    try {
      await api.restoreProposal(p.id)
      onChanged()
    } catch (err) {
      alert(`Не удалось восстановить: ${err}`)
    } finally {
      setMenuOpen(false)
    }
  }

  return (
    <div
      ref={cardRef}
      className="group relative rounded-2xl bg-white border border-[var(--color-border)] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <Link to={`/p/${p.id}`} className="block">
        <div
          className="aspect-[4/3] flex items-center justify-center px-4"
          style={{ background: tileBackground(p.id) }}
        >
          <div className="text-white text-[18px] font-semibold leading-tight text-center line-clamp-3 drop-shadow-sm">
            {p.name}
          </div>
        </div>
        <div className="p-3 pr-9">
          <div className="text-[14px] font-medium truncate">{p.name}</div>
          <div className="text-[12px] text-[var(--color-muted)] mt-0.5">
            Изменён {formatRelativeTime(p.updatedAt)}
          </div>
        </div>
      </Link>

      <div ref={menuRef} className="absolute top-2 right-2">
        <button
          onClick={(e) => { e.preventDefault(); setMenuOpen(o => !o) }}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white transition-opacity shadow-sm"
          aria-label="Меню"
        >
          <EllipsisHorizontalIcon className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-56 bg-white border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden z-10">
            {view === 'active' ? (
              <>
                <MenuItem icon={<PencilSquareIcon className="w-4 h-4" />} label="Переименовать" onClick={handleRename} />
                <MenuItem icon={<LinkIcon className="w-4 h-4" />} label="Скопировать ссылку для клиента" onClick={handleCopyLink} />
                <div className="h-px bg-[var(--color-border)]" />
                <MenuItem icon={<ArchiveBoxIcon className="w-4 h-4" />} label="Архивировать" onClick={handleArchive} danger />
              </>
            ) : (
              <MenuItem icon={<ArrowUturnLeftIcon className="w-4 h-4" />} label="Восстановить" onClick={handleRestore} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-left hover:bg-[var(--color-row-even)] ${
        danger ? 'text-red-600' : 'text-[#202020]'
      }`}
    >
      <span className={danger ? '' : 'text-[var(--color-muted)]'}>{icon}</span>
      {label}
    </button>
  )
}

// Deterministic gradient per proposal id, drawn from a small curated palette
// so tiles read as a cohesive board rather than a random rainbow.
const TILE_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #ec4899, #f97316)',
  'linear-gradient(135deg, #3b82f6, #06b6d4)',
  'linear-gradient(135deg, #8b5cf6, #ec4899)',
  'linear-gradient(135deg, #14b8a6, #6366f1)',
  'linear-gradient(135deg, #f97316, #ec4899)',
]

function tileBackground(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return TILE_GRADIENTS[Math.abs(hash) % TILE_GRADIENTS.length]
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 0) return 'только что'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'только что'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} ${pluralize(min, 'минуту', 'минуты', 'минут')} назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ${pluralize(h, 'час', 'часа', 'часов')} назад`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} ${pluralize(d, 'день', 'дня', 'дней')} назад`
  const date = new Date(ts)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
