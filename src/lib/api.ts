import type { ProjectEstimate } from '../types'
import { SERVER_URL } from '../store'

export interface ProposalMeta {
  id: string
  name: string
  publicToken: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export interface Proposal extends ProposalMeta {
  state: ProjectEstimate
}

export interface PublicView {
  proposal: {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    state: ProjectEstimate
  }
  selections: ClientSelections
}

export interface ClientSelections {
  sections: Record<string, boolean>
  tasks: Record<string, boolean>
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${input}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  listProposals(includeArchived = false): Promise<ProposalMeta[]> {
    const q = includeArchived ? '?includeArchived=1' : ''
    return jsonFetch(`/api/proposals${q}`)
  },
  getProposal(id: string): Promise<Proposal> {
    return jsonFetch(`/api/proposals/${id}`)
  },
  createProposal(name: string, state?: ProjectEstimate): Promise<Proposal> {
    return jsonFetch(`/api/proposals`, {
      method: 'POST',
      body: JSON.stringify({ name, state }),
    })
  },
  renameProposal(id: string, name: string): Promise<Proposal> {
    return jsonFetch(`/api/proposals/${id}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  archiveProposal(id: string): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/proposals/${id}`, { method: 'DELETE' })
  },
  restoreProposal(id: string): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/proposals/${id}/restore`, { method: 'POST' })
  },
  rotateToken(id: string): Promise<Proposal> {
    return jsonFetch(`/api/proposals/${id}/rotate-token`, { method: 'POST' })
  },

  // Public client view
  getPublic(token: string): Promise<PublicView> {
    return jsonFetch(`/api/public/${token}`)
  },
  saveSelections(token: string, selections: ClientSelections): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/public/${token}/selections`, {
      method: 'PUT',
      body: JSON.stringify(selections),
    })
  },
}

export function publicShareUrl(token: string): string {
  return `${window.location.origin}/c/${token}`
}
