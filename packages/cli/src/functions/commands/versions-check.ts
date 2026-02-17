import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'

export const pikkuVersionsCheck = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    if (!visitState.manifest.initial) {
      const manifestPath = join(config.outDir, 'versions.json')
      throw new Error(
        `[${ErrorCode.MANIFEST_MISSING}] Version manifest not found at ${manifestPath}. Run 'pikku init' to create one.`
      )
    }

    if (visitState.manifest.errors.length > 0) {
      const messages = visitState.manifest.errors.map(
        (e) => `[${e.code}] ${e.message}`
      )
      throw new Error(messages.join('\n'))
    }

    logger.info('Version manifest check passed.')
  },
})
