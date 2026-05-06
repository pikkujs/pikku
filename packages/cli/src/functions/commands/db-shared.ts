import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { tsImport } from 'tsx/esm/api'
import type { DevDbConfig } from '../db/local-db.js'

export interface UserConfigShape {
  dev?: {
    db?: DevDbConfig
  }
  [key: string]: unknown
}

interface LoadOptions {
  config: { rootDir: string; outDir: string }
  getInspectorState: (refresh: boolean) => Promise<{
    filesAndMethods: {
      pikkuConfigFactory?: { file: string; variable: string }
    }
  }>
  logger: { error: (msg: string) => void }
}

/**
 * Load the user's pikkuConfig the same way `dev.ts` does — through the
 * inspector state, then by importing the user's config factory file.
 * Returns `null` (and logs the error) if the project hasn't defined a
 * pikkuConfigFactory, so the caller can early-exit.
 */
export async function loadUserConfigForDb(
  options: LoadOptions
): Promise<UserConfigShape | null> {
  const { config, getInspectorState, logger } = options
  const inspectorState = await getInspectorState(true)
  const { pikkuConfigFactory } = inspectorState.filesAndMethods

  if (!pikkuConfigFactory) {
    logger.error('createConfig must be defined in your project')
    return null
  }

  const pikkuDir = resolve(config.rootDir, config.outDir)
  const bootstrapTs = join(pikkuDir, 'pikku-bootstrap.gen.ts')
  const bootstrapJs = join(pikkuDir, 'pikku-bootstrap.gen.js')
  const bootstrapPath = existsSync(bootstrapTs) ? bootstrapTs : bootstrapJs
  await tsImport(bootstrapPath, import.meta.url)

  const configModule = await tsImport(pikkuConfigFactory.file, import.meta.url)
  const userCreateConfig = configModule[pikkuConfigFactory.variable]
  return (await userCreateConfig()) as UserConfigShape
}
