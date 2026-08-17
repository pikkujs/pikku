import { join } from 'node:path'
import type { SurfaceUsageCounts } from '@pikku/inspector'

import type { CLILogger } from '../../services/cli-logger.service.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { mergeSurfaceUsage } from './collect-surface-usage.js'
import { readShippedSurfaceDoc } from './shipped-surface-doc.js'

export const SURFACE_USAGE_FILE = 'surface-usage.gen.json'

/**
 * The per-project half of the surface: which of the exports the shipped doc
 * describes this project actually imports, and where. The counting itself is
 * free — the inspector does it inside the sweep it already makes over every
 * source file — so all that happens here is a merge and a write.
 */
export const writeSurfaceUsage = async (
  logger: CLILogger,
  config: { outDir: string },
  counts: SurfaceUsageCounts
): Promise<void> => {
  const usage = mergeSurfaceUsage({
    counts,
    doc: readShippedSurfaceDoc() ?? undefined,
  })

  await writeFileInDir(
    logger,
    join(config.outDir, SURFACE_USAGE_FILE),
    JSON.stringify(usage, null, 2)
  )
}
