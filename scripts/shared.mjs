import { spawn, spawnSync } from 'node:child_process'
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
const minimumNodeVersion = { major: 20, minor: 19, patch: 0 }

function createRuntimeError(reason) {
  const error = new Error(reason)
  error.code = 'ESTIMATE_RUNTIME_PREREQ'
  return error
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

function parseNodeVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return { major, minor, patch }
}

export function isSupportedNodeVersion(version = process.versions.node) {
  return compareVersions(parseNodeVersion(version), minimumNodeVersion) >= 0
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (isSupportedNodeVersion(version)) return

  throw createRuntimeError(
    `Node.js ${version} is too old. Use Node.js 22 LTS or any version >= ${minimumNodeVersion.major}.${minimumNodeVersion.minor}.${minimumNodeVersion.patch}.`,
  )
}

export function handleRuntimeError(error) {
  if (error?.code !== 'ESTIMATE_RUNTIME_PREREQ') return false

  console.error(`[Setup] ${error.message}`)
  console.error('[Setup] Install Node.js from https://nodejs.org/en/download (npm is bundled with Node.js).')
  console.error('[Setup] This repository uses React + Vite. Next.js is not required.')
  return true
}

export async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore' })
  return !result.error && result.status === 0
}

function ensureNpmAvailable() {
  if (commandExists(npmCmd)) return
  throw createRuntimeError('npm is not available in PATH. It is required to install project dependencies.')
}

function installArgs(targetDir) {
  return pathExists(path.join(targetDir, 'package-lock.json')).then(hasLockfile => (hasLockfile ? ['ci'] : ['install']))
}

async function ensurePackage(label, cwd, checkPath) {
  if (await pathExists(checkPath)) return

  ensureNpmAvailable()
  console.error(`[Setup] Installing ${label} dependencies...`)
  await runCommand(npmCmd, await installArgs(cwd), { cwd })
}

export async function ensureDependencies() {
  assertSupportedNodeVersion()
  await ensurePackage('root', repoRoot, path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'))
  await ensurePackage('MCP server', mcpDir, path.join(mcpDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'))
}

export async function requireAppDependencies() {
  assertSupportedNodeVersion()
  const vitePath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!(await pathExists(vitePath))) {
    console.error('[App] Dependencies are not installed.')
    console.error(`[App] Run "npm run start", "./start.sh", or "start.cmd" in ${repoRoot}`)
    process.exit(1)
  }
  return vitePath
}

export async function requireMcpDependencies() {
  assertSupportedNodeVersion()
  const tsxPath = path.join(mcpDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!(await pathExists(tsxPath))) {
    console.error('[MCP] Dependencies are not installed.')
    console.error(`[MCP] Run "npm run start", "./start.sh", or "node ${path.join('scripts', 'setup.mjs')}" in ${repoRoot}`)
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
  return Promise.all([
    canListenOnHost(port, '127.0.0.1'),
    canListenOnHost(port, '::'),
  ]).then(results => results.every(Boolean))
}

function canListenOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', (error) => {
      if (host === '::' && (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL')) {
        resolve(true)
        return
      }
      resolve(false)
    })
    server.listen(port, host, () => {
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
  const autoOpenDisabled = process.env.ESTIMATE_DISABLE_OPEN === '1' || process.env.CI === '1' || process.env.CI === 'true'
  if (autoOpenDisabled) return

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
