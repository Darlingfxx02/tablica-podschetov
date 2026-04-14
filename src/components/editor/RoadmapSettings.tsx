import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { getSettings } from '../../lib/roadmap'
import type { RoadmapSettings } from '../../types'
import { ApprovalPercentControl } from '../shared/ApprovalPercentControl'

export function RoadmapSettingsPanel() {
  const { state, dispatch } = useStore()
  const settings = getSettings(state.roadmapSettings)
  const hasApprovals = state.sections.some(section => section.sectionType === 'approval')
  const checkboxLabelClass = 'flex flex-col gap-1 cursor-pointer'
  const checkboxControlClass = 'flex h-9 items-center gap-2'
  const stackingSliderStyle = {
    ['--slider-fill' as string]: `${settings.smallTaskThreshold ?? 80}%`,
    ['--slider-color' as string]: '#6366f1',
  } as CSSProperties

  const [hoursText, setHoursText] = useState(String(settings.hoursPerDay))

  useEffect(() => { setHoursText(String(settings.hoursPerDay)) }, [settings.hoursPerDay])

  function update(patch: Partial<RoadmapSettings>) {
    dispatch({
      type: 'SET_ROADMAP_SETTINGS',
      settings: { ...settings, ...patch },
    })
  }

  return (
    <div className="flex flex-wrap items-start gap-4 px-4 py-3 bg-white border-b border-gray-200">
      {/* Grouping toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-gray-400">Группировка</span>
        <div className="flex h-9 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => update({ grouping: 'by-phase' })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
              settings.grouping !== 'by-section'
                ? 'bg-white shadow-sm text-dark'
                : 'text-gray-500 hover:text-dark'
            }`}
          >
            По этапам
          </button>
          <button
            onClick={() => update({ grouping: 'by-section' })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
              settings.grouping === 'by-section'
                ? 'bg-white shadow-sm text-dark'
                : 'text-gray-500 hover:text-dark'
            }`}
          >
            По разделам
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-gray-400">Дата начала</span>
        <input
          type="date"
          value={settings.startDate}
          onChange={e => update({ startDate: e.target.value })}
          className="h-9 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-gray-400">Часов в день</span>
        <input
          type="number"
          min={1}
          max={24}
          value={hoursText}
          onChange={e => setHoursText(e.target.value)}
          onBlur={() => {
            const n = Number(hoursText)
            const val = n >= 1 && n <= 24 ? n : settings.hoursPerDay
            setHoursText(String(val))
            update({ hoursPerDay: val })
          }}
          className="h-9 w-20 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all"
        />
      </label>

      {hasApprovals && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-400">Согласование</span>
            <select
              value={settings.approvalMode ?? 'after-task'}
              onChange={e => update({ approvalMode: e.target.value as RoadmapSettings['approvalMode'] })}
              className="h-9 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all"
            >
              <option value="after-task">После задачи</option>
              <option value="weekly">Раз в неделю</option>
              <option value="after-block">После блока</option>
            </select>
          </label>

          {settings.approvalMode === 'weekly' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400">День недели</span>
              <select
                value={settings.approvalWeekday ?? 5}
                onChange={e => update({ approvalWeekday: Number(e.target.value) })}
                className="h-9 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all"
              >
                <option value={1}>Понедельник</option>
                <option value={2}>Вторник</option>
                <option value={3}>Среда</option>
                <option value={4}>Четверг</option>
                <option value={5}>Пятница</option>
              </select>
            </label>
          )}
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-gray-400">Порог стэкинга</span>
        <div className="flex h-9 items-center gap-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.smallTaskThreshold ?? 80}
            onChange={e => update({ smallTaskThreshold: Number(e.target.value) })}
            style={stackingSliderStyle}
            className="anlish-slider w-24"
          />
          <span className="text-sm text-gray-600 w-10">{settings.smallTaskThreshold ?? 80}%</span>
        </div>
      </label>

      {hasApprovals && <ApprovalPercentControl compact />}

      <label className={checkboxLabelClass}>
        <span aria-hidden className="invisible text-[11px] text-gray-400 select-none">
          Порог стэкинга
        </span>
        <span className={checkboxControlClass}>
          <input
            type="checkbox"
            checked={settings.skipWeekends}
            onChange={e => update({ skipWeekends: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-gray-600">Без выходных</span>
        </span>
      </label>

      <label className={checkboxLabelClass}>
        <span aria-hidden className="invisible text-[11px] text-gray-400 select-none">
          Порог стэкинга
        </span>
        <span className={checkboxControlClass}>
          <input
            type="checkbox"
            checked={settings.skipHolidays}
            onChange={e => update({ skipHolidays: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-gray-600">Праздники РФ</span>
        </span>
      </label>

      <label className={checkboxLabelClass}>
        <span aria-hidden className="invisible text-[11px] text-gray-400 select-none">
          Порог стэкинга
        </span>
        <span className={checkboxControlClass}>
          <input
            type="checkbox"
            checked={settings.showDisclaimer}
            onChange={e => update({ showDisclaimer: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-gray-600">Уведомление о сроках</span>
        </span>
      </label>
    </div>
  )
}
