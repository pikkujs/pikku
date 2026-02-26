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
      visitState.requiredSchemas,
      config.schema?.supportsImportAttributes ?? true,
      config.addonName || null
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
