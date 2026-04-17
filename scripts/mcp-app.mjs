import path from 'node:path'
import process from 'node:process'
import { handleRuntimeError, mcpDir, nodeCmd, requireMcpDependencies, spawnManaged } from './shared.mjs'

try {
  const tsxPath = await requireMcpDependencies()
  const entryPath = path.join(mcpDir, 'src', 'index.ts')

  const child = spawnManaged(nodeCmd, [tsxPath, entryPath], {
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
} catch (error) {
  if (handleRuntimeError(error)) {
    process.exit(1)
  }
  throw error
}
