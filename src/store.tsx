/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react'
import type { ProjectEstimate, Role, Section, Task, SectionType, Breakpoint, RoadmapSettings } from './types'

// Empty string in dev — Vite proxies /api and /ws to the mcp-server, so the
// frontend talks to its own origin and cookies stay same-origin. In prod the
// build runs with VITE_MCP_SERVER_URL=https://api.kp.darlingdesign.pro
// (Dockerfile arg), and SERVER_URL becomes that absolute URL.
export const SERVER_URL: string = import.meta.env?.VITE_MCP_SERVER_URL ?? ''

function wsUrl(): string {
  if (SERVER_URL) return SERVER_URL.replace(/^http/, 'ws') + '/ws'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

const WS_URL = wsUrl()

function storageKeyFor(proposalId: string): string {
  return `proposal-${proposalId}`
}

export const ROLE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
]

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function nextRoleColor(roles: Role[]): string {
  return ROLE_COLORS[roles.length % ROLE_COLORS.length]
}

export function createEmptyRole(roles: Role[]): Role {
  return {
    id: generateId(),
    category: '',
    title: '',
    hourlyRate: 0,
    color: nextRoleColor(roles),
  }
}

const defaultState: ProjectEstimate = {
  projectName: 'Проект',
  roles: [
    { id: 'r1', category: 'Проектирование / Дизайн', title: 'Middle UX / UI-дизайнер', hourlyRate: 2850, color: ROLE_COLORS[0] },
    { id: 'r2', category: 'Проектирование / Дизайн', title: 'Дизайн-директор', hourlyRate: 4000, color: ROLE_COLORS[1] },
  ],
  sections: [],
  contact: { lines: ['tg: @konakovart', 'info@uxart.ru', 'uxart.ru'] },
}

const DEFAULT_CONTACT_LINES = ['tg: @konakovart', 'info@uxart.ru', 'uxart.ru']

export function getContactLines(lines: string[]): string[] {
  const cleaned = lines.filter(l => l.trim())
  return cleaned.length > 0 ? cleaned : DEFAULT_CONTACT_LINES
}

export function isContactUrl(line: string): boolean {
  const s = line.trim()
  if (s.includes('@') || s.includes(' ')) return false
  return /^[\w-]+(?:\.[\w-]+)+(?:\/[^\s]*)?$/i.test(s)
}

type Action =
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'ADD_ROLE'; role?: Role }
  | { type: 'UPDATE_ROLE'; role: Role }
  | { type: 'REMOVE_ROLE'; id: string }
  | { type: 'REORDER_ROLE'; fromId: string; toId: string }
  | { type: 'ADD_SECTION'; sectionType?: SectionType; name?: string }
  | { type: 'TOGGLE_BREAKPOINT'; sectionId: string; breakpoint: Breakpoint }
  | { type: 'UPDATE_SECTION_NAME'; id: string; name: string }
  | { type: 'TOGGLE_SECTION_LINK'; id: string }
  | { type: 'TOGGLE_SECTION_OPTIONAL'; id: string }
  | { type: 'TOGGLE_SECTION_DISABLED'; id: string }
  | { type: 'TOGGLE_TASK_OPTIONAL'; sectionId: string; taskId: string }
  | { type: 'REMOVE_SECTION'; id: string }
  | { type: 'MOVE_SECTION'; id: string; direction: 'up' | 'down' }
  | { type: 'REORDER_SECTION'; fromId: string; toId: string }
  | { type: 'ADD_TASK'; sectionId: string; afterTaskId?: string }
  | { type: 'ADD_DIVIDER'; sectionId: string }
  | { type: 'UPDATE_TASK'; sectionId: string; task: Task }
  | { type: 'REMOVE_TASK'; sectionId: string; taskId: string }
  | { type: 'MOVE_TASK'; sectionId: string; taskId: string; direction: 'up' | 'down' }
  | { type: 'REORDER_TASK'; sectionId: string; fromId: string; toId: string }
  | { type: 'SET_CONTACT'; lines: string[] }
  | { type: 'SET_ROADMAP_SETTINGS'; settings: RoadmapSettings }
  | { type: 'LOAD'; state: ProjectEstimate }

function getApprovalPercent(state: ProjectEstimate): number {
  return state.roadmapSettings?.approvalPercent ?? 25
}

function computeApprovalTask(state: ProjectEstimate, existingTaskId?: string): Task {
  const pct = getApprovalPercent(state)
  const task: Task = {
    id: existingTaskId || generateId(),
    title: 'Обсуждение и правки',
    description: `${pct}% от общего времени проекта`,
    hours: {},
  }
  state.roles.forEach(r => {
    const total = state.sections
      .filter(s => s.sectionType !== 'approval')
      .reduce(
        (sum, s) => sum + s.tasks.reduce((ts, t) => ts + (t.hours[r.id] || 0), 0),
        0,
      )
    task.hours[r.id] = Math.round(total * (pct / 100))
  })
  return task
}

/** Recompute all approval sections' tasks based on current approvalPercent */
function recomputeApprovalSections(state: ProjectEstimate): ProjectEstimate {
  const hasApproval = state.sections.some(s => s.sectionType === 'approval')
  if (!hasApproval) return state
  return {
    ...state,
    sections: state.sections.map(s => {
      if (s.sectionType !== 'approval') return s
      const existingTask = s.tasks[0]
      return {
        ...s,
        tasks: [computeApprovalTask(state, existingTask?.id)],
      }
    }),
  }
}

function reducer(state: ProjectEstimate, action: Action): ProjectEstimate {
  const next = reducerInner(state, action)
  // Auto-recompute approval section hours after any change (except LOAD)
  if (action.type !== 'LOAD' && next !== state) {
    return recomputeApprovalSections(next)
  }
  return next
}

function reducerInner(state: ProjectEstimate, action: Action): ProjectEstimate {
  switch (action.type) {
    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.name }

    case 'ADD_ROLE':
      return { ...state, roles: [...state.roles, action.role ?? createEmptyRole(state.roles)] }

    case 'UPDATE_ROLE':
      return { ...state, roles: state.roles.map(r => r.id === action.role.id ? action.role : r) }

    case 'REMOVE_ROLE':
      return { ...state, roles: state.roles.filter(r => r.id !== action.id) }

    case 'REORDER_ROLE': {
      const fromIdx = state.roles.findIndex(r => r.id === action.fromId)
      const toIdx = state.roles.findIndex(r => r.id === action.toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return state
      const roles = [...state.roles]
      const [moved] = roles.splice(fromIdx, 1)
      roles.splice(toIdx, 0, moved)
      return { ...state, roles }
    }

    case 'ADD_SECTION': {
      const sType = action.sectionType || 'custom'
      const customName = action.name

      if (sType === 'design') {
        const groupId = generateId()
        const projLabel = customName ? `Проектирование: ${customName}` : 'Проектирование'
        const desLabel = customName ? `Дизайн: ${customName}` : 'Дизайн'
        const projecting: Section = {
          id: generateId(),
          name: projLabel,
          sectionType: 'projecting',
          linkedGroupId: groupId,
          tasks: [],
        }
        const design: Section = {
          id: generateId(),
          name: desLabel,
          sectionType: 'design',
          linkedGroupId: groupId,
          tasks: [],
        }
        return { ...state, sections: [...state.sections, projecting, design] }
      }

      if (sType === 'prototyping') {
        const groupId = generateId()
        const projLabel = customName ? `Проектирование: ${customName}` : 'Проектирование'
        const protoLabel = customName ? `Прототипирование: ${customName}` : 'Прототипирование'
        const projecting: Section = {
          id: generateId(),
          name: projLabel,
          sectionType: 'projecting',
          linkedGroupId: groupId,
          tasks: [],
        }
        const prototyping: Section = {
          id: generateId(),
          name: protoLabel,
          sectionType: 'prototyping',
          linkedGroupId: groupId,
          tasks: [],
        }
        return { ...state, sections: [...state.sections, projecting, prototyping] }
      }

      if (sType === 'adaptive') {
        return {
          ...state,
          sections: [
            ...state.sections,
            {
              id: generateId(),
              name: customName || 'Адаптивы',
              sectionType: 'adaptive',
              breakpoints: [],
              tasks: [],
            },
          ],
        }
      }

      if (sType === 'approval') {
        return {
          ...state,
          sections: [
            ...state.sections,
            {
              id: generateId(),
              name: customName || 'Согласование и правки',
              sectionType: 'approval',
              tasks: [computeApprovalTask(state)],
            },
          ],
        }
      }

      return {
        ...state,
        sections: [
          ...state.sections,
          { id: generateId(), name: customName || '', sectionType: 'custom', tasks: [] },
        ],
      }
    }

    case 'TOGGLE_BREAKPOINT': {
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id !== action.sectionId) return s
          const bps = s.breakpoints || []
          const has = bps.includes(action.breakpoint)
          const order: Breakpoint[] = ['desktop', 'tablet', 'mobile']
          const nextSet = new Set(bps)
          if (has) nextSet.delete(action.breakpoint)
          else nextSet.add(action.breakpoint)
          const newBps = order.filter(b => nextSet.has(b))
          const bpLabels: Record<Breakpoint, string> = {
            desktop: 'Десктоп',
            tablet: 'Планшет',
            mobile: 'Мобилка',
          }
          const newTasks = newBps.map(bp => {
            const existing = s.tasks.find(t => t.title === bpLabels[bp])
            return existing || { id: generateId(), title: bpLabels[bp], description: '', hours: {} }
          })
          return { ...s, breakpoints: newBps, tasks: newTasks }
        }),
      }
    }

    case 'UPDATE_SECTION_NAME':
      return { ...state, sections: state.sections.map(s => s.id === action.id ? { ...s, name: action.name } : s) }

    case 'TOGGLE_SECTION_LINK': {
      const target = state.sections.find(s => s.id === action.id)
      if (!target?.linkedGroupId) return state
      const groupId = target.linkedGroupId
      const nextBroken = !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s =>
          s.linkedGroupId === groupId ? { ...s, linkBroken: nextBroken } : s,
        ),
      }
    }

    case 'TOGGLE_SECTION_OPTIONAL': {
      const target = state.sections.find(s => s.id === action.id)
      if (!target) return state
      const next = !target.optional
      const synced = !!target.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.id) return { ...s, optional: next }
          if (synced && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return { ...s, optional: next }
          }
          return s
        }),
      }
    }

    case 'TOGGLE_SECTION_DISABLED': {
      const target = state.sections.find(s => s.id === action.id)
      if (!target) return state
      const next = !target.disabled
      const synced = !!target.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.id) return { ...s, disabled: next }
          if (synced && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return { ...s, disabled: next }
          }
          return s
        }),
      }
    }

    case 'TOGGLE_TASK_OPTIONAL': {
      const target = state.sections.find(s => s.id === action.sectionId)
      const oldTask = target?.tasks.find(t => t.id === action.taskId)
      if (!target || !oldTask) return state
      const next = !oldTask.optional
      const linkId = oldTask.linkId
      const synced = !!target.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            return { ...s, tasks: s.tasks.map(t => t.id === action.taskId ? { ...t, optional: next } : t) }
          }
          if (synced && linkId && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return {
              ...s,
              tasks: s.tasks.map(t => t.linkId === linkId ? { ...t, optional: next } : t),
            }
          }
          return s
        }),
      }
    }

    case 'REMOVE_SECTION':
      return { ...state, sections: state.sections.filter(s => s.id !== action.id) }

    case 'MOVE_SECTION': {
      const idx = state.sections.findIndex(s => s.id === action.id)
      if (idx === -1) return state
      const newIdx = action.direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= state.sections.length) return state
      const sections = [...state.sections]
      ;[sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]]
      return { ...state, sections }
    }

    case 'REORDER_SECTION': {
      const fromSection = state.sections.find(s => s.id === action.fromId)
      const toSection = state.sections.find(s => s.id === action.toId)
      if (!fromSection || !toSection || fromSection.id === toSection.id) return state

      const fromGroupId = fromSection.linkedGroupId && !fromSection.linkBroken
        ? fromSection.linkedGroupId
        : null
      const toGroupId = toSection.linkedGroupId && !toSection.linkBroken
        ? toSection.linkedGroupId
        : null
      if (fromGroupId && fromGroupId === toGroupId) return state

      const movingIds = new Set(
        fromGroupId
          ? state.sections.filter(s => s.linkedGroupId === fromGroupId).map(s => s.id)
          : [fromSection.id],
      )
      const targetIds = new Set(
        toGroupId
          ? state.sections.filter(s => s.linkedGroupId === toGroupId).map(s => s.id)
          : [toSection.id],
      )

      const fromFirstIdx = state.sections.findIndex(s => movingIds.has(s.id))
      const toFirstIdx = state.sections.findIndex(s => targetIds.has(s.id))

      const movingItems = state.sections.filter(s => movingIds.has(s.id))
      const remaining = state.sections.filter(s => !movingIds.has(s.id))

      let insertIdx: number
      if (fromFirstIdx < toFirstIdx) {
        let lastTarget = -1
        remaining.forEach((s, i) => { if (targetIds.has(s.id)) lastTarget = i })
        insertIdx = lastTarget + 1
      } else {
        const firstTarget = remaining.findIndex(s => targetIds.has(s.id))
        insertIdx = firstTarget === -1 ? 0 : firstTarget
      }

      remaining.splice(insertIdx, 0, ...movingItems)
      return { ...state, sections: remaining }
    }

    case 'ADD_TASK': {
      const target = state.sections.find(s => s.id === action.sectionId)
      if (!target) return state
      const synced = !!target.linkedGroupId && !target.linkBroken
      const linkId = synced ? generateId() : undefined
      const newTask: Task = {
        id: generateId(),
        linkId,
        title: '',
        description: '',
        hours: {},
      }
      const anchorTask = action.afterTaskId
        ? target.tasks.find(t => t.id === action.afterTaskId)
        : null
      const anchorLinkId = anchorTask?.linkId
      function endOfGroup(tasks: Task[], dividerIdx: number): number {
        for (let i = dividerIdx + 1; i < tasks.length; i++) {
          if (tasks[i].isDivider) return i
        }
        return tasks.length
      }
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            if (anchorTask) {
              const dividerIdx = s.tasks.findIndex(t => t.id === anchorTask.id)
              const insertAt = endOfGroup(s.tasks, dividerIdx)
              const next = [...s.tasks]
              next.splice(insertAt, 0, newTask)
              return { ...s, tasks: next }
            }
            return { ...s, tasks: [...s.tasks, newTask] }
          }
          if (synced && linkId && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            const linkedTask: Task = { id: generateId(), linkId, title: '', description: '', hours: {} }
            if (anchorLinkId) {
              const dividerIdx = s.tasks.findIndex(t => t.linkId === anchorLinkId)
              if (dividerIdx !== -1) {
                const insertAt = endOfGroup(s.tasks, dividerIdx)
                const next = [...s.tasks]
                next.splice(insertAt, 0, linkedTask)
                return { ...s, tasks: next }
              }
            }
            return { ...s, tasks: [...s.tasks, linkedTask] }
          }
          return s
        }),
      }
    }

    case 'ADD_DIVIDER': {
      const target = state.sections.find(s => s.id === action.sectionId)
      if (!target) return state
      const synced = !!target.linkedGroupId && !target.linkBroken
      const linkId = synced ? generateId() : undefined
      const newDivider: Task = {
        id: generateId(),
        linkId,
        title: '',
        description: '',
        hours: {},
        isDivider: true,
      }
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            return { ...s, tasks: [...s.tasks, newDivider] }
          }
          if (synced && linkId && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return {
              ...s,
              tasks: [
                ...s.tasks,
                {
                  id: generateId(),
                  linkId,
                  title: '',
                  description: '',
                  hours: {},
                  isDivider: true,
                },
              ],
            }
          }
          return s
        }),
      }
    }

    case 'UPDATE_TASK': {
      const target = state.sections.find(s => s.id === action.sectionId)
      const oldTask = target?.tasks.find(t => t.id === action.task.id)
      const linkId = oldTask?.linkId
      const synced = !!target?.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            return { ...s, tasks: s.tasks.map(t => t.id === action.task.id ? action.task : t) }
          }
          if (synced && linkId && target?.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return {
              ...s,
              tasks: s.tasks.map(t =>
                t.linkId === linkId
                  ? { ...t, title: action.task.title, description: action.task.description }
                  : t,
              ),
            }
          }
          return s
        }),
      }
    }

    case 'REMOVE_TASK': {
      const target = state.sections.find(s => s.id === action.sectionId)
      const oldTask = target?.tasks.find(t => t.id === action.taskId)
      const linkId = oldTask?.linkId
      const synced = !!target?.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            return { ...s, tasks: s.tasks.filter(t => t.id !== action.taskId) }
          }
          if (synced && linkId && target?.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return { ...s, tasks: s.tasks.filter(t => t.linkId !== linkId) }
          }
          return s
        }),
      }
    }

    case 'MOVE_TASK': {
      const target = state.sections.find(s => s.id === action.sectionId)
      if (!target) return state
      const oldTask = target.tasks.find(t => t.id === action.taskId)
      const linkId = oldTask?.linkId
      const synced = !!target.linkedGroupId && !target.linkBroken
      return {
        ...state,
        sections: state.sections.map(s => {
          const isTarget = s.id === action.sectionId
          const isLinked =
            synced && !!linkId && !!target.linkedGroupId && s.linkedGroupId === target.linkedGroupId
          if (!isTarget && !isLinked) return s
          const idx = isTarget
            ? s.tasks.findIndex(t => t.id === action.taskId)
            : s.tasks.findIndex(t => t.linkId === linkId)
          if (idx === -1) return s
          const newIdx = action.direction === 'up' ? idx - 1 : idx + 1
          if (newIdx < 0 || newIdx >= s.tasks.length) return s
          const tasks = [...s.tasks]
          ;[tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]]
          return { ...s, tasks }
        }),
      }
    }

    case 'REORDER_TASK': {
      const target = state.sections.find(s => s.id === action.sectionId)
      if (!target) return state
      const fromTask = target.tasks.find(t => t.id === action.fromId)
      const toTask = target.tasks.find(t => t.id === action.toId)
      const fromLinkId = fromTask?.linkId
      const toLinkId = toTask?.linkId
      const synced = !!target.linkedGroupId && !target.linkBroken
      const canMirror = synced && !!fromLinkId && !!toLinkId
      return {
        ...state,
        sections: state.sections.map(s => {
          const isTarget = s.id === action.sectionId
          const isLinked =
            canMirror && !!target.linkedGroupId && s.linkedGroupId === target.linkedGroupId
          if (!isTarget && !isLinked) return s
          const fromIdx = isTarget
            ? s.tasks.findIndex(t => t.id === action.fromId)
            : s.tasks.findIndex(t => t.linkId === fromLinkId)
          const toIdx = isTarget
            ? s.tasks.findIndex(t => t.id === action.toId)
            : s.tasks.findIndex(t => t.linkId === toLinkId)
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return s
          const tasks = [...s.tasks]
          const [moved] = tasks.splice(fromIdx, 1)
          tasks.splice(toIdx, 0, moved)
          return { ...s, tasks }
        }),
      }
    }

    case 'SET_CONTACT':
      return { ...state, contact: { lines: action.lines } }

    case 'SET_ROADMAP_SETTINGS':
      return { ...state, roadmapSettings: action.settings }

    case 'LOAD':
      return action.state

    default:
      return state
  }
}

function loadCachedState(proposalId: string): ProjectEstimate | null {
  try {
    const saved = localStorage.getItem(storageKeyFor(proposalId))
    if (saved) {
      const data = JSON.parse(saved) as ProjectEstimate
      data.roles = data.roles.map((r, i) => r.color ? r : { ...r, color: ROLE_COLORS[i % ROLE_COLORS.length] })
      return data
    }
  } catch { /* ignore */ }
  return null
}

const StoreContext = createContext<{
  state: ProjectEstimate
  dispatch: React.Dispatch<Action>
  proposalId: string
}>({ state: defaultState, dispatch: () => {}, proposalId: '' })

/**
 * Provides editor state for a single proposal. Re-mount with a different
 * proposalId (use it as a `key` prop on the parent route) to switch documents.
 */
export function StoreProvider({ proposalId, children }: { proposalId: string; children: ReactNode }) {
  const initialFromCache = loadCachedState(proposalId)
  const [state, dispatch] = useReducer(reducer, initialFromCache ?? defaultState)
  const isRemoteUpdate = useRef(false)
  // Until we've either loaded from cache or heard back from the server, do not
  // PUT — otherwise the placeholder defaultState would overwrite real data on
  // first mount of a brand-new proposalId.
  const hasAuthoritativeState = useRef(initialFromCache !== null)
  const wsRef = useRef<WebSocket | null>(null)
  const putTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${SERVER_URL}/api/proposals/${proposalId}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((proposal: { state: ProjectEstimate }) => {
        if (cancelled) return
        isRemoteUpdate.current = true
        hasAuthoritativeState.current = true
        dispatch({ type: 'LOAD', state: proposal.state })
      })
      .catch(() => {
        // Server unreachable: trust the cache (or defaultState) from now on so
        // the user's offline edits get queued for the next successful PUT.
        if (!cancelled) hasAuthoritativeState.current = true
      })
    return () => { cancelled = true }
  }, [proposalId])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>
    let ws: WebSocket

    function connect() {
      try {
        ws = new WebSocket(`${WS_URL}?proposalId=${encodeURIComponent(proposalId)}`)
        wsRef.current = ws

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'state_update' && msg.proposalId === proposalId) {
              isRemoteUpdate.current = true
              dispatch({ type: 'LOAD', state: msg.state })
            }
          } catch { /* ignore parse errors */ }
        }

        ws.onclose = () => {
          wsRef.current = null
          reconnectTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => { ws.close() }
      } catch {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [proposalId])

  useEffect(() => {
    localStorage.setItem(storageKeyFor(proposalId), JSON.stringify(state))

    if (!hasAuthoritativeState.current) return

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false
      return
    }

    if (putTimerRef.current) clearTimeout(putTimerRef.current)
    putTimerRef.current = setTimeout(() => {
      putTimerRef.current = null
      fetch(`${SERVER_URL}/api/proposals/${proposalId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }).catch(() => { /* offline edit; cache stays */ })
    }, 250)
  }, [state, proposalId])

  useEffect(() => {
    return () => {
      if (putTimerRef.current) clearTimeout(putTimerRef.current)
    }
  }, [])

  return (
    <StoreContext.Provider value={{ state, dispatch, proposalId }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}
