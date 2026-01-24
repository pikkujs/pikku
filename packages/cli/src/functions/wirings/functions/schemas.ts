import { pikkuSessionlessFunc } from '#pikku'
import {
  saveSchemas,
  generateSchemas,
  generateZodSchemas,
} from '../../../utils/schema-generator.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

/**
 * Generate JSON schemas from TypeScript types and Zod schemas
 */
export const pikkuSchemas = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    const schemas = await generateSchemas(
      logger,
      config.tsconfig,
      visitState.functions.typesMap,
      visitState.functions.meta,
      visitState.http.meta,
      config.schemasFromTypes,
      config.schema?.additionalProperties,
      visitState.zodLookup
    )

    const zodSchemas = await generateZodSchemas(
      logger,
      visitState.zodLookup,
      visitState.functions.typesMap
    )

    await saveSchemas(
      logger,
      config.schemaDirectory,
      { ...schemas, ...zodSchemas },
      visitState.functions.typesMap,
      visitState.functions.meta,
      config.schema?.supportsImportAttributes || true,
      config.schemasFromTypes,
      visitState.zodLookup,
      config.externalPackageName || null
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating schemas',
      commandEnd: 'Generated schemas',
    }),
  ],
})
