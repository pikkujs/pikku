/**
 * Generates Cloudflare Worker entry point files for each deployment unit.
 *
 * Each entry point:
 * 1. Imports the filtered bootstrap from the unit's .pikku/ directory
 * 2. Imports the appropriate Cloudflare handler factory based on the unit's role
 * 3. Exports the handler as the default export
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'

export type DeploymentUnitRole =
  | 'http'
  | 'rpc'
  | 'mcp'
  | 'queue-consumer'
  | 'scheduled'
  | 'agent'
  | 'channel'
  | 'workflow-orchestrator'
  | 'workflow-step'

export interface EntryGeneratorUnit {
  name: string
  role: DeploymentUnitRole
  /** Path to the unit's .pikku directory (from per-unit codegen) */
  pikkuDir: string
}

/**
 * Maps a deployment unit role to its Cloudflare handler import/export.
 */
function getHandlerCode(role: DeploymentUnitRole): {
  importStatement: string
  exportStatement: string
} {
  switch (role) {
    case 'http':
    case 'agent':
    case 'rpc':
    case 'workflow-orchestrator':
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
    case 'workflow-step':
      return {
        importStatement: `import { createCloudflareQueueHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareQueueHandler()`,
      }
    case 'scheduled':
      return {
        importStatement: `import { createCloudflareCronHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareCronHandler()`,
      }
    case 'channel':
      return {
        importStatement: `import { createCloudflareWebSocketHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWebSocketHandler()`,
      }
  }
}

/**
 * Generates entry source for a single unit.
 * The bootstrap import path is relative from the entry file to the unit's .pikku/ dir.
 */
export function generateEntrySource(
  unit: EntryGeneratorUnit,
  entryFilePath: string
): string {
  const { importStatement, exportStatement } = getHandlerCode(unit.role)
  const entryDir = dirname(entryFilePath)
  const bootstrapRelative = relative(
    entryDir,
    join(unit.pikkuDir, 'pikku-bootstrap.gen.js')
  )
  // Ensure it starts with ./ for a relative import
  const bootstrapPath = bootstrapRelative.startsWith('.')
    ? bootstrapRelative
    : `./${bootstrapRelative}`

  return [
    `// Generated Cloudflare Worker entry for "${unit.name}" (${unit.role})`,
    ``,
    importStatement,
    `import '${bootstrapPath}'`,
    ``,
    exportStatement,
    ``,
  ].join('\n')
}

/**
 * Generates Cloudflare Worker entry point files for all deployment units.
 *
 * @param units - Units with their .pikku directories from per-unit codegen
 * @param outputDir - Directory to write entry files into
 * @returns Map of unit name → entry file path
 */
export async function generateCloudflareEntryFiles(
  units: EntryGeneratorUnit[],
  outputDir: string
): Promise<Map<string, string>> {
  const entries = new Map<string, string>()

  for (const unit of units) {
    const entryPath = join(outputDir, unit.name, 'entry.ts')
    const source = generateEntrySource(unit, entryPath)

    await mkdir(dirname(entryPath), { recursive: true })
    await writeFile(entryPath, source, 'utf-8')
    entries.set(unit.name, entryPath)
  }

  return entries
}
