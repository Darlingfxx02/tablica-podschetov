import { spawn } from 'node:child_process'
import process from 'node:process'
import { delay, findOpenPort, npmCmd, repoRoot, spawnManaged, waitForUrl } from './shared.mjs'

function randomPortStart(base, spread) {
  return base + Math.floor(Math.random() * spread)
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return

  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'inherit' })
      killer.on('error', reject)
      killer.on('exit', (code) => {
        if (code === 0 || code === 128) {
          resolve()
          return
        }
        reject(new Error(`taskkill exited with code ${code ?? 'unknown'}`))
      })
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    return
  }

  await delay(500)

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // ignore cleanup race
    }
  }
}

async function main() {
  const appStart = parseInt(process.env.ESTIMATE_SMOKE_APP_PORT || String(randomPortStart(41000, 4000)), 10)
  const mcpStart = parseInt(process.env.ESTIMATE_SMOKE_HTTP_PORT || String(randomPortStart(46000, 4000)), 10)
  const appPort = await findOpenPort(appStart, 200)
  const mcpPort = await findOpenPort(mcpStart, 200)
  const appUrl = `http://127.0.0.1:${appPort}`
  const mcpUrl = `http://127.0.0.1:${mcpPort}/api/health`

  console.error(`[Smoke] Starting clean-launch check with npm run start`)
  console.error(`[Smoke] Expecting app on ${appUrl}`)
  console.error(`[Smoke] Expecting MCP on ${mcpUrl}`)

  const child = spawnManaged(npmCmd, ['run', 'start'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ESTIMATE_APP_PORT: String(appPort),
      ESTIMATE_HTTP_PORT: String(mcpPort),
      ESTIMATE_DISABLE_OPEN: '1',
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })

  const childExit = new Promise((_, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      reject(new Error(`[Smoke] Launcher exited before verification with ${suffix}`))
    })
  })
  childExit.catch(() => {})

  const cleanupAndExit = async (code = 0) => {
    await stopProcessTree(child)
    process.exit(code)
  }

  process.on('SIGINT', () => {
    void cleanupAndExit(130)
  })
  process.on('SIGTERM', () => {
    void cleanupAndExit(143)
  })

  try {
    await Promise.race([
      Promise.all([
        waitForUrl(appUrl, 120000),
        waitForUrl(mcpUrl, 120000),
      ]),
      childExit,
    ])

    console.error('[Smoke] Fresh checkout launch succeeded.')
  } finally {
    await stopProcessTree(child)
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
