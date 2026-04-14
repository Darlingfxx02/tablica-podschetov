/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react'
import type { ProjectEstimate, Role, Section, Task, SectionType, Breakpoint, RoadmapSettings } from './types'

const STORAGE_KEY = 'project-estimate'
const MCP_SERVER_URL = import.meta.env?.VITE_MCP_SERVER_URL || 'http://localhost:24880'
const MCP_WS_URL = MCP_SERVER_URL.replace(/^http/, 'ws') + '/ws'

const ROLE_COLORS = [
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
  | { type: 'REMOVE_SECTION'; id: string }
  | { type: 'MOVE_SECTION'; id: string; direction: 'up' | 'down' }
  | { type: 'REORDER_SECTION'; fromId: string; toId: string }
  | { type: 'ADD_TASK'; sectionId: string }
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
      const fromIdx = state.sections.findIndex(s => s.id === action.fromId)
      const toIdx = state.sections.findIndex(s => s.id === action.toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return state
      const sections = [...state.sections]
      const [moved] = sections.splice(fromIdx, 1)
      sections.splice(toIdx, 0, moved)
      return { ...state, sections }
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
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id === action.sectionId) {
            return { ...s, tasks: [...s.tasks, newTask] }
          }
          if (synced && linkId && target.linkedGroupId && s.linkedGroupId === target.linkedGroupId) {
            return {
              ...s,
              tasks: [
                ...s.tasks,
                { id: generateId(), linkId, title: '', description: '', hours: {} },
              ],
            }
          }
          return s
        }),
      }
    }

    case 'ADD_DIVIDER': {
      const newDivider: Task = {
        id: generateId(),
        title: '',
        description: '',
        hours: {},
        isDivider: true,
      }
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId ? { ...s, tasks: [...s.tasks, newDivider] } : s,
        ),
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
      return {
        ...state,
        sections: state.sections.map(s => {
          if (s.id !== action.sectionId) return s
          const fromIdx = s.tasks.findIndex(t => t.id === action.fromId)
          const toIdx = s.tasks.findIndex(t => t.id === action.toId)
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

function loadState(): ProjectEstimate {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved) as ProjectEstimate
      // Migrate: assign colors to roles that don't have one
      data.roles = data.roles.map((r, i) => r.color ? r : { ...r, color: ROLE_COLORS[i % ROLE_COLORS.length] })
      return data
    }
  } catch { /* ignore */ }
  return defaultState
}

const StoreContext = createContext<{
  state: ProjectEstimate
  dispatch: React.Dispatch<Action>
}>({ state: defaultState, dispatch: () => {} })

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)
  const isRemoteUpdate = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)

  // Load initial state from MCP server
  useEffect(() => {
    fetch(`${MCP_SERVER_URL}/api/state`)
      .then(res => res.json())
      .then((serverState: ProjectEstimate) => {
        isRemoteUpdate.current = true
        dispatch({ type: 'LOAD', state: serverState })
      })
      .catch(() => {
        // Server not available, use localStorage (already loaded)
      })
  }, [])

  // WebSocket connection for real-time sync
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>
    let ws: WebSocket

    function connect() {
      try {
        ws = new WebSocket(MCP_WS_URL)
        wsRef.current = ws

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'state_update') {
              isRemoteUpdate.current = true
              dispatch({ type: 'LOAD', state: msg.state })
            }
          } catch { /* ignore parse errors */ }
        }

        ws.onclose = () => {
          wsRef.current = null
          reconnectTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
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
  }, [])

  // Persist to localStorage + sync to server
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    // Don't send back to server if this was a remote update
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false
      return
    }

    // Sync state to server
    fetch(`${MCP_SERVER_URL}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {
      // Server not available, that's ok
    })
  }, [state])

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}
