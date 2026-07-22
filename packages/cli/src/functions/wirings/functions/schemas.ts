import { pikkuSessionlessFunc } from '#pikku'
import { saveSchemas } from '../../../utils/serialize-schemas.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuSchemas = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // Bodies missing while functions still DECLARE schemas means the inspection pass
    // was partial. Writing from it would empty register.gen.ts and delete the files
    // behind schemas that are still required — unregistering the whole app off a bad
    // read. Leave the previous output alone.
    //
    // Zero REQUIRED schemas is a different thing entirely and must still be written:
    // that is a project whose last schema was removed, and it is the case where the
    // files left by earlier runs have to be cleared.
    if (
      visitState.requiredSchemas.size > 0 &&
      Object.keys(visitState.schemas).length === 0
    ) {
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
