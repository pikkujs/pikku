/**
 * Generates TypeScript entry point files for each worker.
 *
 * Each entry point imports only the functions that belong to that worker,
 * then creates and exports the appropriate handler based on the worker's role.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import type { WorkerRole, WorkerSpec } from './types.js'

/**
 * Maps a worker role to its handler factory import and invocation.
 */
function getHandlerCode(role: WorkerRole): {
  importStatement: string
  exportStatement: string
} {
  switch (role) {
    case 'http':
      return {
        importStatement: `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWorkerHandler()`,
      }
    case 'mcp':
      return {
        importStatement: `import { createCloudflareMCPHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareMCPHandler()`,
      }
    case 'queue-consumer':
      return {
        importStatement: `import { createCloudflareQueueHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareQueueHandler()`,
      }
    case 'cron':
      return {
        importStatement: `import { createCloudflareCronHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareCronHandler()`,
      }
    case 'agent':
      return {
        importStatement: `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWorkerHandler()`,
      }
    case 'remote':
      return {
        importStatement: `import { createCloudflareServiceBindingHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareServiceBindingHandler()`,
      }
    case 'workflow-step':
      return {
        importStatement: `import { createCloudflareQueueHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareQueueHandler()`,
      }
  }
}

/**
 * Generates a TypeScript entry point file for a given worker.
 *
 * The entry file:
 * 1. Imports the bootstrap file (which registers the function with Pikku)
 * 2. Imports the handler factory for the worker's role
 * 3. Exports the handler as the default export
 */
export function generateEntrySource(worker: WorkerSpec): string {
  const { importStatement, exportStatement } = getHandlerCode(worker.role)

  const lines: string[] = [
    `// Generated entry for worker "${worker.name}" (role: ${worker.role})`,
    `// DO NOT EDIT — this file is regenerated on each build`,
    ``,
    importStatement,
    `import '${worker.entryPoint}' // registers function(s): ${worker.functionIds.join(', ')}`,
    ``,
    exportStatement,
    ``,
  ]

  return lines.join('\n')
}

/**
 * Writes entry point files for all workers to the output directory.
 *
 * Returns a map of worker name to entry file path.
 */
export async function generateEntryFiles(
  workers: WorkerSpec[],
  outputDir: string
): Promise<Map<string, string>> {
  const entries = new Map<string, string>()

  for (const worker of workers) {
    const entryPath = join(outputDir, worker.name, 'entry.ts')
    const source = generateEntrySource(worker)

    await mkdir(dirname(entryPath), { recursive: true })
    await writeFile(entryPath, source, 'utf-8')

    entries.set(worker.name, entryPath)
  }

  return entries
}
