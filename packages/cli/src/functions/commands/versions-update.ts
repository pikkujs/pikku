import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { createEmptyManifest } from '../../utils/contract-version.js'
import { ErrorCode } from '@pikku/inspector'
import {
  loadManifest,
  saveManifest,
  extractContractsFromMeta,
  validateContracts,
  updateManifest,
  ContractEntry,
} from '../../utils/contract-versions.js'

export const pikkuVersionsUpdate = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.outDir, 'versions.json')

    let manifest = await loadManifest(manifestPath)
    if (!manifest) {
      manifest = createEmptyManifest()
    }

    const visitState = await getInspectorState()
    let contracts: Map<string, ContractEntry>

    const hasPrecomputedHashes = Object.values(visitState.functions.meta).some(
      (m) => m.contractHash
    )

    if (hasPrecomputedHashes) {
      contracts = extractContractsFromMeta(visitState.functions.meta)
    } else {
      const { generateSchemas, generateZodSchemas } = await import(
        '../../utils/schema-generator.js'
      )
      const { buildCurrentContracts } = await import(
        '../../utils/contract-versions.js'
      )

      const zodSchemas = await generateZodSchemas(
        logger,
        visitState.schemaLookup,
        visitState.functions.typesMap
      )

      const schemas = await generateSchemas(
        logger,
        config.tsconfig,
        visitState.functions.typesMap,
        visitState.functions.meta,
        visitState.http.meta,
        config.schemasFromTypes,
        config.schema?.additionalProperties,
        visitState.schemaLookup
      )

      const allSchemas = { ...schemas, ...zodSchemas }

      contracts = buildCurrentContracts(
        visitState.functions.meta,
        allSchemas,
        visitState.functions.typesMap
      )
    }

    const result = validateContracts(manifest, contracts)

    const immutabilityErrors = result.errors.filter(
      (e) => e.code === ErrorCode.FUNCTION_VERSION_MODIFIED
    )
    if (immutabilityErrors.length > 0) {
      for (const error of immutabilityErrors) {
        logger.error(`[${error.code}] ${error.message}`)
      }
      process.exit(1)
    }

    const updated = updateManifest(manifest, contracts)
    await saveManifest(manifestPath, updated)
    logger.debug(`Version manifest updated at ${manifestPath}`)
  },
})
