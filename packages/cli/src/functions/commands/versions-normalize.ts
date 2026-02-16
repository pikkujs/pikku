import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { loadManifest, saveManifest } from '../../utils/contract-versions.js'

export const pikkuVersionsNormalize = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const manifestPath = join(config.outDir, 'versions.json')

    const manifest = await loadManifest(manifestPath)
    if (!manifest) {
      logger.error(
        `[${ErrorCode.MANIFEST_MISSING}] Version manifest not found at ${manifestPath}. Run 'pikku versions init' to create one.`
      )
      process.exit(1)
    }

    await saveManifest(manifestPath, manifest)
    logger.info(`Version manifest normalized at ${manifestPath}`)
  },
})
