import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ProposalStore, migrateLegacyState, type StateAdapter } from './store.js'
import { registerTools } from './tools.js'
import { startHttpServer } from './http.js'
import type { ProjectEstimate } from './types.js'
import type { Action } from './reducer.js'

/**
 * Adapter that lets the MCP `tools.ts` keep its single-state mental model
 * while the underlying storage is multi-proposal. All tool dispatches operate
 * on the most recently updated non-archived proposal (created on demand).
 */
function makeDefaultStateAdapter(store: ProposalStore, dbPath: string): StateAdapter {
  return {
    getState(): ProjectEstimate {
      return store.getOrCreateDefault().state
    },
    dispatch(action: Action): ProjectEstimate {
      const p = store.getOrCreateDefault()
      const updated = store.dispatch(p.id, action)
      return updated?.state ?? p.state
    },
    setState(state: ProjectEstimate): void {
      const p = store.getOrCreateDefault()
      store.update(p.id, state)
    },
    getFilePath(): string {
      return dbPath
    },
    onChange(listener: (state: ProjectEstimate) => void): () => void {
      return store.onChange('*', (proposal) => {
        const def = store.getOrCreateDefault()
        if (proposal.id === def.id) listener(proposal.state)
      })
    },
    destroy(): void {
      // ProposalStore is owned by main(); adapter is a thin facade.
    },
  }
}

async function main() {
  // Where the SQLite DB lives. Override with ESTIMATE_DB_PATH.
  const dbPath =
    process.env.ESTIMATE_DB_PATH ||
    path.join(os.homedir(), '.estimate-mcp', 'estimate.db')

  // Path to the legacy single-state file. Used only to import existing data
  // on first boot when the new DB is empty.
  const legacyStatePath =
    process.env.ESTIMATE_STATE_PATH ||
    path.join(os.homedir(), '.estimate-mcp', 'state.json')

  const httpPort = parseInt(process.env.ESTIMATE_HTTP_PORT || '24880', 10)

  const isFresh = !fs.existsSync(dbPath)
  const store = new ProposalStore(dbPath)
  if (isFresh) migrateLegacyState(store, legacyStatePath)
  console.error(`[Store] SQLite DB at ${dbPath}`)

  const stateAdapter = makeDefaultStateAdapter(store, dbPath)

  const mcpServer = new McpServer({
    name: 'estimate-table',
    version: '2.0.0',
  })

  registerTools(mcpServer, stateAdapter)
  console.error(`[MCP] Tools registered`)

  startHttpServer(store, httpPort)

  if (process.env.ESTIMATE_DISABLE_STDIO === '1') {
    console.error('[MCP] Running in app-sync mode without stdio transport')
    await new Promise(() => {})
  }

  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  console.error(`[MCP] Connected via stdio`)
}

main().catch((err) => {
  console.error('[Fatal]', err)
  process.exit(1)
})
