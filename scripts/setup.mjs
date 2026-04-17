import process from 'node:process'
import { ensureDependencies, handleRuntimeError } from './shared.mjs'

try {
  await ensureDependencies()
  console.error('[Setup] Dependencies are ready.')
} catch (error) {
  if (handleRuntimeError(error)) {
    process.exit(1)
  }
  throw error
}
