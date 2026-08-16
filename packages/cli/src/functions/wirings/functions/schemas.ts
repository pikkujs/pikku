import { pikkuSessionlessFunc } from '#pikku/function'
import { saveSchemas } from '../../../utils/serialize-schemas.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { partitionRequiredSchemas } from '../scenarios/scenario-schema-partition.js'

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

    const supportsImportAttributes =
      config.schema?.supportsImportAttributes ?? true

    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: visitState.functions.meta,
      requiredSchemas: visitState.requiredSchemas,
      getUniqueName: (name) =>
        visitState.functions.typesMap.getUniqueName(name),
      schemasFromTypes: config.schemasFromTypes,
    })

    await saveSchemas(
      logger,
      config.schemaDirectory,
      visitState.schemas,
      appRequired,
      supportsImportAttributes,
      config.addonName || null
    )

    // Always written, even when empty — the scenario bootstrap imports it
    // unconditionally, and a project that deleted its last scenario must stop
    // registering the schemas it had.
    await saveSchemas(
      logger,
      config.scenarioSchemaDirectory,
      visitState.schemas,
      scenarioOnly,
      supportsImportAttributes,
      config.addonName || null,
      'scenario schemas'
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
