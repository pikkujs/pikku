import { join, resolve } from 'path'
import type { LocalDbConfig } from '../db/local-db.js'

export interface UserConfigShape {
  dev?: {
    localDb?: LocalDbConfig
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
  const bootstrapPath = join(pikkuDir, 'pikku-bootstrap.gen.js')
  await import(bootstrapPath)

  const configModule = await import(pikkuConfigFactory.file)
  const userCreateConfig = configModule[pikkuConfigFactory.variable]
  return (await userCreateConfig()) as UserConfigShape
}
