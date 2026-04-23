import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { saveManifest } from '../../utils/contract-versions.js'

export const pikkuVersionsUpdate = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.rootDir, 'versions.pikku.json')
    const visitState = await getInspectorState()

    if (!visitState.manifest.initial) {
      logger.warn(`Run 'pikku versions init' to enable contract versioning.`)
      return
    }

    const immutabilityErrors = visitState.manifest.errors.filter(
      (e) => e.code === ErrorCode.FUNCTION_VERSION_MODIFIED
    )
    if (immutabilityErrors.length > 0) {
      for (const e of immutabilityErrors) {
        logger.critical(ErrorCode.FUNCTION_VERSION_MODIFIED, e.message)
      }
      if (logger.hasCriticalErrors()) {
        process.exit(1)
      }
      return
    }

    await saveManifest(manifestPath, visitState.manifest.current!)
    logger.debug(`Version manifest updated at ${manifestPath}`)
  },
})
