import { existsSync } from 'fs'
import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { createEmptyManifest } from '../../utils/contract-version.js'
import { saveManifest } from '../../utils/contract-versions.js'

export const pikkuVersionsInit = pikkuSessionlessFunc<
  { force?: boolean } | void,
  void
>({
  func: async ({ logger, config }, data) => {
    const manifestPath = join(config.outDir, 'versions.json')
    const force =
      data && typeof data === 'object' && 'force' in data ? data.force : false

    if (existsSync(manifestPath) && !force) {
      logger.error(
        `Version manifest already exists at ${manifestPath}. Use --force to overwrite.`
      )
      process.exit(1)
    }

    await saveManifest(manifestPath, createEmptyManifest())
    logger.info(`Version manifest created at ${manifestPath}`)
  },
})
