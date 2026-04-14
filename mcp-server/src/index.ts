import path from 'node:path'
import os from 'node:os'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StateManager } from './state.js'
import { registerTools } from './tools.js'
import { startHttpServer } from './http.js'

async function main() {
  const statePath = process.env.ESTIMATE_STATE_PATH
    || path.join(os.homedir(), '.estimate-mcp', 'state.json')

  const httpPort = parseInt(process.env.ESTIMATE_HTTP_PORT || '24880', 10)

  // Initialize state manager
  const stateManager = new StateManager(statePath)
  console.error(`[State] Loaded from ${statePath}`)

  // Create MCP server
  const mcpServer = new McpServer({
    name: 'estimate-table',
    version: '1.0.0',
  })

  // Register all MCP tools
  registerTools(mcpServer, stateManager)
  console.error(`[MCP] Tools registered`)

  // Start HTTP + WebSocket server (non-blocking)
  startHttpServer(stateManager, httpPort)

  if (process.env.ESTIMATE_DISABLE_STDIO === '1') {
    console.error('[MCP] Running in app-sync mode without stdio transport')
    await new Promise(() => {})
  }

  // Connect MCP via stdio (blocks on stdin)
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  console.error(`[MCP] Connected via stdio`)
}

main().catch((err) => {
  console.error('[Fatal]', err)
  process.exit(1)
})
