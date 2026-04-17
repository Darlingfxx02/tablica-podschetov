import process from 'node:process'
import {
  ensureDependencies,
  findOpenPort,
  handleRuntimeError,
  openUrl,
  repoRoot,
  requireAppDependencies,
  spawnManaged,
  waitForUrl,
} from './shared.mjs'

async function main() {
  const mcpPort = parseInt(process.env.ESTIMATE_HTTP_PORT || '24880', 10)
  const appPort = await findOpenPort(parseInt(process.env.ESTIMATE_APP_PORT || '5173', 10))
  const appUrl = `http://127.0.0.1:${appPort}`
  const children = []
  let shuttingDown = false

  function registerChild(label, child) {
    children.push(child)
    child.on('error', (error) => {
      if (shuttingDown) return
      console.error(`[${label}] failed to start: ${error.message}`)
      shutdown(1)
    })
    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      if (code === 0) return
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      console.error(`[${label}] exited with ${suffix}`)
      shutdown(code ?? 1)
    })
    return child
  }

  function shutdown(exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM')
    }
    setTimeout(() => process.exit(exitCode), 150)
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  await ensureDependencies()
  const viteCliPath = await requireAppDependencies()

  console.error(`[Start] Launching MCP on http://127.0.0.1:${mcpPort}`)
  registerChild(
    'mcp',
    spawnManaged(process.execPath, ['scripts/mcp-app.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ESTIMATE_HTTP_PORT: String(mcpPort),
      },
      stdio: 'inherit',
    }),
  )

  console.error(`[Start] Launching app on ${appUrl}`)
  registerChild(
    'app',
    spawnManaged(process.execPath, [viteCliPath, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VITE_MCP_SERVER_URL: `http://127.0.0.1:${mcpPort}`,
      },
      stdio: 'inherit',
    }),
  )

  await waitForUrl(appUrl)
  openUrl(appUrl)

  console.error(`[Start] App is open: ${appUrl}`)
  console.error('[Start] MCP is part of this launch. If an AI client starts its own MCP process, it will reuse the same state file.')

  await new Promise(() => {})
}

try {
  await main()
} catch (error) {
  if (handleRuntimeError(error)) {
    process.exit(1)
  }
  throw error
}
