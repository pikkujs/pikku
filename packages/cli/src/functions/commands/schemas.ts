import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { saveSchemas, generateSchemas } from '../../utils/schema-generator.js'
import { logCommandInfoAndTime } from '../../middleware/log-command-info-and-time.js'

/**
 * Generate JSON schemas from TypeScript types
 */
export const runSchemas = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()

    const schemas = await generateSchemas(
      logger,
      cliConfig.tsconfig,
      visitState.functions.typesMap,
      visitState.functions.meta,
      visitState.http.meta,
      cliConfig.schemasFromTypes
    )

    await saveSchemas(
      logger,
      cliConfig.schemaDirectory,
      schemas,
      visitState.functions.typesMap,
      visitState.functions.meta,
      cliConfig.supportsImportAttributes,
      cliConfig.schemasFromTypes
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating schemas',
      commandEnd: 'Generated schemas',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
