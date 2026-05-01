import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database, { type Database as Db } from 'better-sqlite3'
import { reducer, defaultState, type Action } from './reducer.js'
import type {
  ProjectEstimate,
  Proposal,
  ProposalMeta,
  ClientSelections,
} from './types.js'

interface ProposalRow {
  id: string
  name: string
  public_token: string
  state: string
  created_at: number
  updated_at: number
  archived_at: number | null
}

interface SelectionsRow {
  proposal_id: string
  selections: string
  updated_at: number
}

type Listener = (proposal: Proposal) => void

/**
 * Surface that MCP tools rely on. ProposalStore itself does not implement it
 * (tools deal with one ProjectEstimate at a time); index.ts wraps the store
 * with an adapter targeting the default proposal.
 */
export interface StateAdapter {
  getState(): ProjectEstimate
  dispatch(action: Action): ProjectEstimate
  setState(state: ProjectEstimate): void
  getFilePath(): string
  onChange(listener: (state: ProjectEstimate) => void): () => void
  destroy(): void
}

export class ProposalStore {
  private db: Db
  private listeners = new Map<string, Set<Listener>>()
  private wildcardListeners = new Set<Listener>()

  constructor(filePath: string) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public_token TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_proposals_archived ON proposals(archived_at);
      CREATE INDEX IF NOT EXISTS idx_proposals_token    ON proposals(public_token);

      CREATE TABLE IF NOT EXISTS client_selections (
        proposal_id TEXT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
        selections  TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
      );
    `)
  }

  list(includeArchived = false): ProposalMeta[] {
    const sql = includeArchived
      ? 'SELECT id, name, public_token, created_at, updated_at, archived_at FROM proposals ORDER BY updated_at DESC'
      : 'SELECT id, name, public_token, created_at, updated_at, archived_at FROM proposals WHERE archived_at IS NULL ORDER BY updated_at DESC'
    const rows = this.db.prepare(sql).all() as ProposalRow[]
    return rows.map(this.rowToMeta)
  }

  get(id: string): Proposal | null {
    const row = this.db
      .prepare('SELECT * FROM proposals WHERE id = ?')
      .get(id) as ProposalRow | undefined
    return row ? this.rowToProposal(row) : null
  }

  getByToken(token: string): Proposal | null {
    const row = this.db
      .prepare('SELECT * FROM proposals WHERE public_token = ? AND archived_at IS NULL')
      .get(token) as ProposalRow | undefined
    return row ? this.rowToProposal(row) : null
  }

  create(name?: string, initial?: ProjectEstimate): Proposal {
    const id = 'kp_' + this.randomBase36(8)
    const token = this.randomBase62(28)
    const now = Date.now()
    const seed: ProjectEstimate = initial
      ? { ...initial, projectName: name || initial.projectName || 'Новый КП' }
      : { ...defaultState, projectName: name || 'Новый КП' }
    this.db
      .prepare(
        'INSERT INTO proposals (id, name, public_token, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, seed.projectName, token, JSON.stringify(seed), now, now)
    const created = this.get(id)!
    this.notify(created)
    return created
  }

  update(id: string, state: ProjectEstimate): Proposal | null {
    const now = Date.now()
    const result = this.db
      .prepare('UPDATE proposals SET state = ?, name = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(state), state.projectName || 'Без имени', now, id)
    if (result.changes === 0) return null
    const updated = this.get(id)!
    this.notify(updated)
    return updated
  }

  rename(id: string, name: string): Proposal | null {
    const current = this.get(id)
    if (!current) return null
    const nextState: ProjectEstimate = { ...current.state, projectName: name }
    return this.update(id, nextState)
  }

  dispatch(id: string, action: Action): Proposal | null {
    const current = this.get(id)
    if (!current) return null
    const nextState = reducer(current.state, action)
    if (nextState === current.state) return current
    return this.update(id, nextState)
  }

  archive(id: string): boolean {
    const result = this.db
      .prepare('UPDATE proposals SET archived_at = ? WHERE id = ?')
      .run(Date.now(), id)
    return result.changes > 0
  }

  restore(id: string): boolean {
    const result = this.db
      .prepare('UPDATE proposals SET archived_at = NULL WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM proposals WHERE id = ?').run(id)
    return result.changes > 0
  }

  rotateToken(id: string): Proposal | null {
    const exists = this.get(id)
    if (!exists) return null
    const token = this.randomBase62(28)
    this.db.prepare('UPDATE proposals SET public_token = ? WHERE id = ?').run(token, id)
    return this.get(id)
  }

  getSelections(proposalId: string): ClientSelections {
    const row = this.db
      .prepare('SELECT selections FROM client_selections WHERE proposal_id = ?')
      .get(proposalId) as SelectionsRow | undefined
    if (!row) return { sections: {}, tasks: {} }
    try {
      return JSON.parse(row.selections) as ClientSelections
    } catch {
      return { sections: {}, tasks: {} }
    }
  }

  setSelections(proposalId: string, selections: ClientSelections): boolean {
    if (!this.get(proposalId)) return false
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO client_selections (proposal_id, selections, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(proposal_id) DO UPDATE SET
           selections = excluded.selections,
           updated_at = excluded.updated_at`,
      )
      .run(proposalId, JSON.stringify(selections), now)
    return true
  }

  /**
   * Returns the canonical "default" proposal — the most recently updated non-archived one.
   * If none exists, creates a fresh one. Used by /api/state for back-compat with the
   * single-proposal frontend until it migrates to the multi-proposal API.
   */
  getOrCreateDefault(seed?: ProjectEstimate): Proposal {
    const list = this.list()
    if (list.length > 0) return this.get(list[0].id)!
    return this.create('Проект', seed)
  }

  /**
   * Subscribe to change events. Pass a proposal id to listen to one document, or '*'
   * for any change in any proposal.
   */
  onChange(target: string | '*', listener: Listener): () => void {
    if (target === '*') {
      this.wildcardListeners.add(listener)
      return () => this.wildcardListeners.delete(listener)
    }
    let set = this.listeners.get(target)
    if (!set) {
      set = new Set()
      this.listeners.set(target, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  destroy(): void {
    this.listeners.clear()
    this.wildcardListeners.clear()
    this.db.close()
  }

  private notify(p: Proposal): void {
    for (const l of this.wildcardListeners) l(p)
    const set = this.listeners.get(p.id)
    if (set) for (const l of set) l(p)
  }

  private rowToMeta = (row: ProposalRow): ProposalMeta => ({
    id: row.id,
    name: row.name,
    publicToken: row.public_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
  })

  private rowToProposal = (row: ProposalRow): Proposal => ({
    ...this.rowToMeta(row),
    state: JSON.parse(row.state) as ProjectEstimate,
  })

  // Random IDs/tokens. Bias from `% N` is negligible at these lengths; we only need
  // collision resistance, not cryptographic uniformity.
  private randomBase36(len: number): string {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
    return this.randomFromAlphabet(alphabet, len)
  }

  private randomBase62(len: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return this.randomFromAlphabet(alphabet, len)
  }

  private randomFromAlphabet(alphabet: string, len: number): string {
    const bytes = crypto.randomBytes(len)
    let out = ''
    for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
    return out
  }
}

/**
 * One-time migration: if the legacy single-proposal state file exists and the DB
 * has no proposals yet, import it as the default proposal so the user keeps their
 * data. Leaves the legacy file in place for safety; it can be removed later by hand.
 */
export function migrateLegacyState(store: ProposalStore, legacyStatePath: string): void {
  if (store.list(true).length > 0) return
  if (!fs.existsSync(legacyStatePath)) return
  try {
    const raw = fs.readFileSync(legacyStatePath, 'utf-8')
    const parsed = JSON.parse(raw) as ProjectEstimate
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) return
    const name = parsed.projectName || 'Импортированный проект'
    store.create(name, parsed)
    console.error(`[Store] Imported legacy state from ${legacyStatePath} as default proposal`)
  } catch (err) {
    console.error('[Store] Failed to import legacy state:', err)
  }
}
