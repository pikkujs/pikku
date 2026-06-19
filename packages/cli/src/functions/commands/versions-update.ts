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
      // A published contract changed without a version bump. We must not save
      // (that would overwrite an immutable record), but a contract drift should
      // not crash `pikku all` / the dev server. Surface it as an `error`
      // diagnostic: printed always, blocking only under `--fail-on-error`.
      // `pikku versions check` remains the hard deploy gate.
      for (const e of immutabilityErrors) {
        logger.diagnostic({
          severity: 'error',
          code: ErrorCode.FUNCTION_VERSION_MODIFIED,
          message: e.message,
        })
      }
      return
    }

    await saveManifest(manifestPath, visitState.manifest.current!)
    logger.debug(`Version manifest updated at ${manifestPath}`)
  },
})
