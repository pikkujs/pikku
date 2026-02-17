import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { saveManifest } from '../../utils/contract-versions.js'

export const pikkuVersionsUpdate = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.outDir, 'versions.json')
    const visitState = await getInspectorState()

    if (!visitState.manifest.initial) {
      throw new Error(
        `Version manifest not found at ${manifestPath}. Run 'pikku init' to create one.`
      )
    }

    const immutabilityErrors = visitState.manifest.errors.filter(
      (e) => e.code === ErrorCode.FUNCTION_VERSION_MODIFIED
    )
    if (immutabilityErrors.length > 0) {
      const messages = immutabilityErrors.map((e) => `[${e.code}] ${e.message}`)
      throw new Error(messages.join('\n'))
    }

    await saveManifest(manifestPath, visitState.manifest.current!)
    logger.debug(`Version manifest updated at ${manifestPath}`)
  },
})
