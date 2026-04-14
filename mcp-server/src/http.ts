import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { StateManager } from './state.js'
import type { Action } from './reducer.js'

export function startHttpServer(stateManager: StateManager, port: number) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Get current state
  app.get('/api/state', (_req, res) => {
    res.json(stateManager.getState())
  })

  // Replace entire state
  app.put('/api/state', (req, res) => {
    stateManager.setState(req.body)
    res.json(stateManager.getState())
  })

  // Dispatch an action
  app.post('/api/action', (req, res) => {
    try {
      const action = req.body as Action
      const newState = stateManager.dispatch(action)
      res.json(newState)
    } catch (err) {
      res.status(400).json({ error: String(err) })
    }
  })

  const httpServer = createServer(app)

  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('error', (err) => {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'EADDRINUSE') return
    console.error('[WS] Failed to start WebSocket server:', err)
  })

  wss.on('connection', (ws) => {
    // Send current state on connect
    ws.send(JSON.stringify({ type: 'state_update', state: stateManager.getState() }))
  })

  // Broadcast state changes to all WebSocket clients
  stateManager.onChange((state) => {
    const message = JSON.stringify({ type: 'state_update', state })
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  })

  httpServer.on('error', (err) => {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'EADDRINUSE') {
      console.error(`[HTTP] Port ${port} is already in use. Continuing in shared-state mode without HTTP/WS.`)
      console.error(`[HTTP] This MCP process will keep using ${stateManager.getFilePath()} for synchronization.`)
      wss.close()
      httpServer.close()
      return
    }
    console.error('[HTTP] Failed to start server:', err)
  })

  httpServer.listen(port, () => {
    console.error(`[HTTP] Server listening on http://localhost:${port}`)
    console.error(`[WS]   WebSocket available at ws://localhost:${port}/ws`)
  })

  return httpServer
}
