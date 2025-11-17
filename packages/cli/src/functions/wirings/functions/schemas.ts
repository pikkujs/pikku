import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  saveSchemas,
  generateSchemas,
} from '../../../utils/schema-generator.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

/**
 * Generate JSON schemas from TypeScript types
 */
export const pikkuSchemas: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    const schemas = await generateSchemas(
      logger,
      config.tsconfig,
      visitState.functions.typesMap,
      visitState.functions.meta,
      visitState.http.meta,
      config.schemasFromTypes,
      config.schema?.additionalProperties
    )

    await saveSchemas(
      logger,
      config.schemaDirectory,
      schemas,
      visitState.functions.typesMap,
      visitState.functions.meta,
      config.schema?.supportsImportAttributes || true,
      config.schemasFromTypes
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
