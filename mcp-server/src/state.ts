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

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), '.estimate-mcp', 'state.json')
    this.state = this.load()
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

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (err) {
      console.error('[StateManager] Failed to persist state:', err)
    }
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
