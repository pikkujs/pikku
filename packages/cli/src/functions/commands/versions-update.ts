import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import {
  loadManifest,
  saveManifest,
  extractContractsFromMeta,
  validateContracts,
  updateManifest,
} from '../../utils/contract-versions.js'

export const pikkuVersionsUpdate = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.outDir, 'versions.json')

    const manifest = await loadManifest(manifestPath)
    if (!manifest) {
      throw new Error(
        `Version manifest not found at ${manifestPath}. Run 'pikku init' to create one.`
      )
    }

    const visitState = await getInspectorState()
    const contracts = extractContractsFromMeta(visitState.functions.meta)

    const result = validateContracts(manifest, contracts)

    const immutabilityErrors = result.errors.filter(
      (e) => e.code === ErrorCode.FUNCTION_VERSION_MODIFIED
    )
    if (immutabilityErrors.length > 0) {
      const messages = immutabilityErrors.map((e) => `[${e.code}] ${e.message}`)
      throw new Error(messages.join('\n'))
    }

    const updated = updateManifest(manifest, contracts)
    await saveManifest(manifestPath, updated)
    logger.debug(`Version manifest updated at ${manifestPath}`)
  },
})
