import { useEffect, useSyncExternalStore } from 'react'
import { api, type ProposalMeta } from './api'

const STORAGE_KEY = 'kp-proposals-cache-v1'

type CacheState = {
  data: ProposalMeta[] | null
  loading: boolean
  error: string | null
}

function loadFromStorage(): ProposalMeta[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed as ProposalMeta[]
  } catch {
    return null
  }
}

function saveToStorage(list: ProposalMeta[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // quota errors are non-fatal — the next refresh will repopulate
  }
}

let state: CacheState = {
  data: loadFromStorage(),
  loading: false,
  error: null,
}

const listeners = new Set<() => void>()

function emit(next: CacheState): void {
  state = next
  listeners.forEach(l => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

let inflight: Promise<ProposalMeta[] | null> | null = null

export function refreshProposals(): Promise<ProposalMeta[] | null> {
  if (inflight) return inflight
  emit({ ...state, loading: true })
  inflight = api.listProposals(true)
    .then(list => {
      saveToStorage(list)
      emit({ data: list, loading: false, error: null })
      return list
    })
    .catch(err => {
      emit({ ...state, loading: false, error: String(err) })
      return null
    })
    .finally(() => { inflight = null })
  return inflight
}

function setData(next: ProposalMeta[]): void {
  saveToStorage(next)
  emit({ ...state, data: next, error: null })
}

export function patchProposalInCache(id: string, patch: Partial<ProposalMeta>): void {
  if (!state.data) return
  setData(state.data.map(p => p.id === id ? { ...p, ...patch } : p))
}

export function removeProposalFromCache(id: string): void {
  if (!state.data) return
  setData(state.data.filter(p => p.id !== id))
}

export function addProposalToCache(p: ProposalMeta): void {
  setData(state.data ? [p, ...state.data] : [p])
}

export function clearProposalsCache(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  emit({ data: null, loading: false, error: null })
}

export function useProposals(): {
  proposals: ProposalMeta[] | null
  loading: boolean
  error: string | null
  refresh: () => Promise<ProposalMeta[] | null>
} {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state)
  useEffect(() => {
    void refreshProposals()
  }, [])
  return {
    proposals: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refreshProposals,
  }
}
