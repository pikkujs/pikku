import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import {
  loadManifest,
  extractContractsFromMeta,
  validateContracts,
} from '../../utils/contract-versions.js'

export const pikkuVersionsCheck = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.outDir, 'versions.json')

    const manifest = await loadManifest(manifestPath)
    if (!manifest) {
      throw new Error(
        `[${ErrorCode.MANIFEST_MISSING}] Version manifest not found at ${manifestPath}. Run 'pikku init' to create one.`
      )
    }

    const visitState = await getInspectorState()
    const contracts = extractContractsFromMeta(visitState.functions.meta)

    const result = validateContracts(manifest, contracts)

    if (!result.valid) {
      const messages = result.errors.map((e) => `[${e.code}] ${e.message}`)
      throw new Error(messages.join('\n'))
    }

    logger.info('Version manifest check passed.')
  },
})
