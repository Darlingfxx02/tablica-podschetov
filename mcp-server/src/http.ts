import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { ProposalStore } from './store.js'
import type { Action } from './reducer.js'
import type { ClientSelections, Proposal } from './types.js'

/** What we expose on the public client endpoint — token is intentionally stripped. */
function publicView(p: Proposal, selections: ClientSelections) {
  return {
    proposal: {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      state: p.state,
    },
    selections,
  }
}

export function startHttpServer(store: ProposalStore, port: number) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // ── Proposals (admin) ─────────────────────────────────────────────────────
  app.get('/api/proposals', (req, res) => {
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'
    res.json(store.list(includeArchived))
  })

  app.post('/api/proposals', (req, res) => {
    const { name, state } = (req.body ?? {}) as { name?: string; state?: Parameters<ProposalStore['create']>[1] }
    const created = store.create(name, state)
    res.status(201).json(created)
  })

  app.get('/api/proposals/:id', (req, res) => {
    const p = store.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Not found' })
    res.json(p)
  })

  app.put('/api/proposals/:id', (req, res) => {
    const updated = store.update(req.params.id, req.body)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  })

  app.post('/api/proposals/:id/action', (req, res) => {
    try {
      const updated = store.dispatch(req.params.id, req.body as Action)
      if (!updated) return res.status(404).json({ error: 'Not found' })
      res.json(updated)
    } catch (err) {
      res.status(400).json({ error: String(err) })
    }
  })

  app.post('/api/proposals/:id/rename', (req, res) => {
    const { name } = (req.body ?? {}) as { name?: string }
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' })
    const updated = store.rename(req.params.id, name.trim())
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  })

  app.post('/api/proposals/:id/rotate-token', (req, res) => {
    const updated = store.rotateToken(req.params.id)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  })

  app.delete('/api/proposals/:id', (req, res) => {
    const ok = store.archive(req.params.id)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  app.post('/api/proposals/:id/restore', (req, res) => {
    const ok = store.restore(req.params.id)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  // ── Public client view ────────────────────────────────────────────────────
  app.get('/api/public/:token', (req, res) => {
    const p = store.getByToken(req.params.token)
    if (!p) return res.status(404).json({ error: 'Not found' })
    const selections = store.getSelections(p.id)
    res.json(publicView(p, selections))
  })

  app.put('/api/public/:token/selections', (req, res) => {
    const p = store.getByToken(req.params.token)
    if (!p) return res.status(404).json({ error: 'Not found' })
    const body = req.body as ClientSelections
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid body' })
    const selections: ClientSelections = {
      sections: (body.sections && typeof body.sections === 'object') ? body.sections : {},
      tasks: (body.tasks && typeof body.tasks === 'object') ? body.tasks : {},
    }
    store.setSelections(p.id, selections)
    res.json({ ok: true })
  })

  // ── Back-compat: legacy single-state API ──────────────────────────────────
  // The frontend will be migrated in Phase 2. Until then, /api/state operates on
  // the most recently updated non-archived proposal (or creates one if missing).
  app.get('/api/state', (_req, res) => {
    const p = store.getOrCreateDefault()
    res.json(p.state)
  })

  app.put('/api/state', (req, res) => {
    const p = store.getOrCreateDefault()
    const updated = store.update(p.id, req.body)
    res.json(updated?.state ?? req.body)
  })

  app.post('/api/action', (req, res) => {
    try {
      const p = store.getOrCreateDefault()
      const updated = store.dispatch(p.id, req.body as Action)
      res.json(updated?.state)
    } catch (err) {
      res.status(400).json({ error: String(err) })
    }
  })

  // ── HTTP + WebSocket boot ─────────────────────────────────────────────────
  const httpServer = createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('error', (err) => {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'EADDRINUSE') return
    console.error('[WS] Failed to start WebSocket server:', err)
  })

  // WS clients can subscribe by appending ?proposalId=… to the URL.
  // No proposalId → subscribed to the default proposal (back-compat for the
  // existing frontend). Phase 2 will switch to explicit subscription.
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const explicitId = url.searchParams.get('proposalId')
    const initial = explicitId
      ? store.get(explicitId)
      : store.getOrCreateDefault()
    if (!initial) {
      ws.send(JSON.stringify({ type: 'error', error: 'unknown proposal' }))
      ws.close()
      return
    }
    ;(ws as WebSocket & { __proposalId?: string }).__proposalId = initial.id
    ws.send(JSON.stringify({ type: 'state_update', proposalId: initial.id, state: initial.state }))
  })

  store.onChange('*', (proposal) => {
    const message = JSON.stringify({
      type: 'state_update',
      proposalId: proposal.id,
      state: proposal.state,
    })
    const defaultId = store.getOrCreateDefault().id
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue
      const subscribed = (client as WebSocket & { __proposalId?: string }).__proposalId
      // A client subscribed to this proposal — or default subscriber and this is the default.
      if (subscribed === proposal.id || (!subscribed && proposal.id === defaultId)) {
        client.send(message)
      }
    }
  })

  httpServer.on('error', (err) => {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'EADDRINUSE') {
      console.error(`[HTTP] Port ${port} is already in use. Continuing in shared-state mode without HTTP/WS.`)
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
