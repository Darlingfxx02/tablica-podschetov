import { useState } from 'react'
import {
  PaintBrushIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { PuzzlePieceIcon as PuzzlePieceSolidIcon } from '@heroicons/react/24/solid'
import { useUiSettings, type OptionalDisplay } from '../lib/uiSettings'
import { SidebarPortal } from '../components/AppLayout'

type CategoryId = 'appearance'

interface Category {
  id: CategoryId
  label: string
  icon: React.ReactNode
}

const CATEGORIES: Category[] = [
  { id: 'appearance', label: 'Внешний вид', icon: <PaintBrushIcon className="w-4 h-4" /> },
]

export function SettingsPage() {
  const [activeId, setActiveId] = useState<CategoryId>('appearance')

  return (
    <>
      <SidebarPortal>
        <Sidebar activeId={activeId} onChange={setActiveId} />
      </SidebarPortal>
      <main className="flex-1 min-w-0 px-10 py-8 overflow-y-auto">
        <header className="mb-6">
          <h1 className="text-[24px] font-semibold leading-tight">
            {CATEGORIES.find(c => c.id === activeId)?.label}
          </h1>
        </header>
        {activeId === 'appearance' && <AppearanceSettings />}
      </main>
    </>
  )
}

function Sidebar({
  activeId,
  onChange,
}: {
  activeId: CategoryId
  onChange: (id: CategoryId) => void
}) {
  return (
    <nav className="px-2 flex-1 space-y-0.5">
      {CATEGORIES.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
            activeId === c.id
              ? 'bg-[#202020] text-white'
              : 'text-[#202020] hover:bg-[var(--color-row-even)]'
          }`}
        >
          <span className={activeId === c.id ? '' : 'text-[var(--color-muted)]'}>{c.icon}</span>
          <span className="flex-1 text-left">{c.label}</span>
        </button>
      ))}
    </nav>
  )
}

function AppearanceSettings() {
  const { settings, patch } = useUiSettings()

  return (
    <div className="max-w-2xl space-y-8">
      <SettingRow
        title="Опциональные разделы"
        description="Как помечать в боковом меню разделы, которые клиент сможет отключить в публичном виде КП."
      >
        <DisplaySegment
          value={settings.optionalDisplay}
          onChange={(v) => patch({ optionalDisplay: v })}
        />
      </SettingRow>
    </div>
  )
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-4 border-b border-[var(--color-border)]">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium leading-tight">{title}</div>
        {description && (
          <div className="text-[12px] text-[var(--color-muted)] mt-1 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function DisplaySegment({
  value,
  onChange,
}: {
  value: OptionalDisplay
  onChange: (v: OptionalDisplay) => void
}) {
  return (
    <div className="flex p-0.5 bg-[var(--color-row-even)] rounded-lg">
      <SegmentButton
        active={value === 'pill'}
        onClick={() => onChange('pill')}
      >
        <span className="font-bold tracking-wide text-[12px] text-indigo-700">опца</span>
      </SegmentButton>
      <SegmentButton
        active={value === 'icon'}
        onClick={() => onChange('icon')}
      >
        <PuzzlePieceSolidIcon className="w-4 h-4 text-indigo-500" />
      </SegmentButton>
    </div>
  )
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 px-4 h-8 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-white text-[#202020] shadow-sm'
          : 'text-[var(--color-muted)] hover:text-[#202020]'
      }`}
    >
      {children}
      {active && <CheckIcon className="w-3.5 h-3.5 text-indigo-500" />}
    </button>
  )
}

