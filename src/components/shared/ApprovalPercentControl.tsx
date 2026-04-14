import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { sectionTotalHours } from '../../lib/calculations'
import { getSettings } from '../../lib/roadmap'

interface ApprovalPercentControlProps {
  compact?: boolean
}

export function ApprovalPercentControl({ compact = false }: ApprovalPercentControlProps) {
  const { state, dispatch } = useStore()
  const settings = getSettings(state.roadmapSettings)
  const approvalSection = state.sections.find(section => section.sectionType === 'approval')

  if (!approvalSection) return null

  const projectHours = state.sections
    .filter(section => section.sectionType !== 'approval')
    .reduce((sum, section) => sum + sectionTotalHours(section), 0)
  const approvalHours = sectionTotalHours(approvalSection)
  const percent = settings.approvalPercent ?? 25

  function updatePercent(nextPercent: number) {
    dispatch({
      type: 'SET_ROADMAP_SETTINGS',
      settings: { ...settings, approvalPercent: nextPercent },
    })
  }

  const sliderStyle = {
    ['--slider-fill' as string]: `${percent}%`,
    ['--slider-color' as string]: '#f59e0b',
  } as CSSProperties

  if (compact) {
    return (
      <label className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-400">Созвоны и правки</div>
        <div className="flex h-9 items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={e => updatePercent(Number(e.target.value))}
            style={sliderStyle}
            className="anlish-slider w-24"
          />
          <span className="text-sm text-gray-600 w-10">{percent}%</span>
        </div>
      </label>
    )
  }

  const wrapperClass = 'rounded-xl border border-gray-200 bg-white px-4 py-4'

  return (
    <div className={wrapperClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-400">Созвоны и правки</div>
          <div className={`mt-1 ${compact ? 'text-sm' : 'text-sm'} font-medium text-dark`}>
            Процент от длительности проекта
          </div>
          {!compact && (
            <div className="mt-1 text-sm text-gray-500">
              Значение синхронизировано с расчётным блоком и дорожной картой.
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className={`rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-dark ${compact ? 'text-sm' : 'text-excel-11'}`}>
            {percent}%
          </span>
          {!compact && (
            <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm text-gray-500">
              {approvalHours} ч
            </span>
          )}
        </div>
      </div>

      <div className={compact ? 'mt-3' : 'mt-4'}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={e => updatePercent(Number(e.target.value))}
          style={sliderStyle}
          className="anlish-slider"
        />
      </div>

      <div className={`mt-3 flex items-center justify-between gap-2 ${compact ? 'text-[11px]' : 'text-sm'} text-gray-500`}>
        <span>0%</span>
        <div className="min-w-0 text-center">
          {approvalHours} ч от {projectHours} ч проекта
        </div>
        <span>100%</span>
      </div>
    </div>
  )
}
