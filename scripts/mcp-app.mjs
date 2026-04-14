import path from 'node:path'
import process from 'node:process'
import { mcpDir, requireMcpDependencies, spawnManaged } from './shared.mjs'

const tsxPath = await requireMcpDependencies()
const entryPath = path.join(mcpDir, 'src', 'index.ts')

const child = spawnManaged(tsxPath, [entryPath], {
  cwd: mcpDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ESTIMATE_DISABLE_STDIO: '1',
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
