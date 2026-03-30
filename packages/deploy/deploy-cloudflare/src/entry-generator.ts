/**
 * Generates Cloudflare Worker entry point files for each deployment unit.
 *
 * Each entry point:
 * 1. Imports the filtered bootstrap from the unit's .pikku/ directory
 * 2. Imports the appropriate Cloudflare handler based on the unit's role and handlers
 * 3. Exports the handler as the default export
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'

export type DeploymentUnitRole =
  | 'function'
  | 'mcp'
  | 'agent'
  | 'channel'
  | 'workflow'
  | 'workflow-step'

type DeploymentHandler =
  | {
      type: 'fetch'
      routes: Array<{ method: string; route: string; pikkuFuncId: string }>
    }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

export interface EntryGeneratorUnit {
  name: string
  role: DeploymentUnitRole
  handlers: DeploymentHandler[]
  /** Path to the unit's .pikku directory (from per-unit codegen) */
  pikkuDir: string
}

/**
 * Maps a deployment unit to its Cloudflare handler import/export.
 * Function and workflow-step units use the combined handler.
 * Gateway units use their dedicated handler factories.
 */
function getHandlerCode(unit: EntryGeneratorUnit): {
  importStatement: string
  exportStatement: string
  extraExports: string[]
} {
  switch (unit.role) {
    case 'function':
    case 'workflow-step': {
      const handlerTypes = [...new Set(unit.handlers.map((h) => h.type))]
      return {
        importStatement: `import { createCloudflareHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareHandler(${JSON.stringify(handlerTypes)})`,
        extraExports: [],
      }
    }
    case 'mcp':
    case 'agent':
    case 'workflow':
      return {
        importStatement: `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWorkerHandler()`,
        extraExports: [],
      }
    case 'channel':
      return {
        importStatement: `import { createCloudflareWebSocketHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWebSocketHandler()`,
        extraExports: [
          `export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare'`,
        ],
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
  const { importStatement, exportStatement, extraExports } =
    getHandlerCode(unit)
  const entryDir = dirname(entryFilePath)
  const bootstrapRelative = relative(
    entryDir,
    join(unit.pikkuDir, 'pikku-bootstrap.gen.js')
  )
  // Ensure it starts with ./ for a relative import
  const bootstrapPath = bootstrapRelative.startsWith('.')
    ? bootstrapRelative
    : `./${bootstrapRelative}`

  const lines = [
    `// Generated Cloudflare Worker entry for "${unit.name}" (${unit.role})`,
    ``,
    importStatement,
    `import '${bootstrapPath}'`,
    ``,
    ...extraExports,
    exportStatement,
    ``,
  ]

  return lines.join('\n')
}

/**
 * Generates Cloudflare Worker entry point files for all deployment units.
 *
 * @param units - Units with their .pikku directories from per-unit codegen
 * @param outputDir - Directory to write entry files into
 * @returns Map of unit name -> entry file path
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
