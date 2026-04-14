import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(scriptsDir, '..')
export const mcpDir = path.join(repoRoot, 'mcp-server')
export const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
export const nodeCmd = process.execPath

function binName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

export async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function ensureDependencies() {
  const rootNodeModules = path.join(repoRoot, 'node_modules')
  if (!(await pathExists(rootNodeModules))) {
    console.error('[Setup] Installing root dependencies...')
    await runCommand(npmCmd, ['install'], { cwd: repoRoot })
  }

  const mcpNodeModules = path.join(mcpDir, 'node_modules')
  if (!(await pathExists(mcpNodeModules))) {
    console.error('[Setup] Installing MCP server dependencies...')
    await runCommand(npmCmd, ['install'], { cwd: mcpDir })
  }
}

export async function requireMcpDependencies() {
  const tsxPath = path.join(mcpDir, 'node_modules', '.bin', binName('tsx'))
  if (!(await pathExists(tsxPath))) {
    console.error('[MCP] Dependencies are not installed.')
    console.error(`[MCP] Run "npm run start" or "node ${path.join('scripts', 'setup.mjs')}" in ${repoRoot}`)
    process.exit(1)
  }
  return tsxPath
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited with signal ${signal}`))
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
  })
}

export function spawnManaged(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  })
}

export async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + 19}`)
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

export async function waitForUrl(url, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' })
      if (response.ok) return
    } catch {
      // keep polling until timeout
    }
    await delay(400)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

export function openUrl(url) {
  if (process.platform === 'darwin') {
    const child = spawn('open', [url], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }

  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }

  const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
  child.unref()
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
