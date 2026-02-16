import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import {
  loadManifest,
  buildCurrentContracts,
  validateContracts,
} from '../../utils/contract-versions.js'

export const pikkuVersionsCheck = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const manifestPath = join(config.outDir, 'versions.json')

    const manifest = await loadManifest(manifestPath)
    if (!manifest) {
      logger.error(
        `[${ErrorCode.MANIFEST_MISSING}] Version manifest not found at ${manifestPath}. Run 'pikku versions init' to create one.`
      )
      process.exit(1)
    }

    const visitState = await getInspectorState()

    const { generateSchemas, generateZodSchemas } = await import(
      '../../utils/schema-generator.js'
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

    const contracts = buildCurrentContracts(
      visitState.functions.meta,
      allSchemas,
      visitState.functions.typesMap
    )

    const result = validateContracts(manifest, contracts)

    if (!result.valid) {
      for (const error of result.errors) {
        logger.error(`[${error.code}] ${error.message}`)
      }
      process.exit(1)
    }

    logger.info('Version manifest check passed.')
  },
})
