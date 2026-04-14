import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProjectEstimate } from './types.js'
import { reducer, defaultState, type Action } from './reducer.js'

export class StateManager {
  private state: ProjectEstimate
  private filePath: string
  private listeners = new Set<(state: ProjectEstimate) => void>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private lastSerializedState: string

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), '.estimate-mcp', 'state.json')
    this.state = this.load()
    this.lastSerializedState = this.serialize(this.state)
    this.startFileWatch()
  }

  getState(): ProjectEstimate {
    return this.state
  }

  getFilePath(): string {
    return this.filePath
  }

  dispatch(action: Action): ProjectEstimate {
    this.state = reducer(this.state, action)
    this.schedulePersist()
    this.notify()
    return this.state
  }

  setState(state: ProjectEstimate): void {
    this.state = state
    this.schedulePersist()
    this.notify()
  }

  destroy(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    fs.unwatchFile(this.filePath)
  }

  onChange(listener: (state: ProjectEstimate) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persist(), 500)
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => this.reloadFromDisk(), 150)
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const serialized = this.serialize(this.state)
      this.lastSerializedState = serialized
      fs.writeFileSync(this.filePath, serialized, 'utf-8')
    } catch (err) {
      console.error('[StateManager] Failed to persist state:', err)
    }
  }

  private reloadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return
      const serialized = fs.readFileSync(this.filePath, 'utf-8')
      if (!serialized.trim() || serialized === this.lastSerializedState) return
      this.state = JSON.parse(serialized) as ProjectEstimate
      this.lastSerializedState = serialized
      this.notify()
    } catch (err) {
      console.error('[StateManager] Failed to reload state:', err)
    }
  }

  private startFileWatch(): void {
    fs.watchFile(this.filePath, { interval: 700 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return
      this.scheduleReload()
    })
  }

  private serialize(state: ProjectEstimate): string {
    return JSON.stringify(state, null, 2)
  }

  private load(): ProjectEstimate {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        return JSON.parse(data) as ProjectEstimate
      }
    } catch (err) {
      console.error('[StateManager] Failed to load state:', err)
    }
    return { ...defaultState }
  }
}
