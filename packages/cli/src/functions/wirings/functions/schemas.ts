import { pikkuSessionlessFunc } from '#pikku'
import { saveSchemas } from '../../../utils/serialize-schemas.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuSchemas = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    if (Object.keys(visitState.schemas).length === 0) {
      return undefined
    }

    await saveSchemas(
      logger,
      config.schemaDirectory,
      visitState.schemas,
      visitState.functions.typesMap,
      visitState.functions.meta,
      config.schema?.supportsImportAttributes ?? true,
      config.schemasFromTypes,
      visitState.schemaLookup,
      config.externalPackageName || null
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Writing schemas',
      commandEnd: 'Wrote schemas',
    }),
  ],
})
