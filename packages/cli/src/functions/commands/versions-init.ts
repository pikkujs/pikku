import { existsSync } from 'fs'
import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import {
  createEmptyManifest,
  saveManifest,
} from '../../utils/contract-versions.js'

export const pikkuVersionsInit = pikkuSessionlessFunc<
  { force?: boolean },
  void
>({
  func: async ({ logger, config }, { force }) => {
    const manifestPath = join(config.outDir, 'versions.json')

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
