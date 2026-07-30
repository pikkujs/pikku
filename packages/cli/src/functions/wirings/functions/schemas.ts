import { pikkuSessionlessFunc } from '#pikku'
import type { FunctionsMeta } from '@pikku/core'
import { saveSchemas } from '../../../utils/serialize-schemas.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { partitionScenarioFunctionsMeta } from '../scenarios/scenario-partition.js'

/**
 * The schema names a set of functions validates against, resolved the same way
 * `computeRequiredSchemas` resolves them so the two cannot disagree about which
 * name a type ended up under.
 */
const schemaNamesFor = (
  meta: FunctionsMeta,
  getUniqueName: (name: string) => string
): Set<string> => {
  const names = new Set<string>()
  for (const { inputs, outputs } of Object.values(meta)) {
    for (const type of [inputs?.[0], outputs?.[0]]) {
      if (!type) continue
      try {
        names.add(getUniqueName(type))
      } catch {
        names.add(type)
      }
    }
  }
  return names
}

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

    // A scenario's input/output schemas are as test-only as its body. Left in the
    // app's register.gen.ts they are imported by every deployed bundle — on one
    // project half the registered schemas belonged to scenarios and steps.
    // Anything an application function also needs stays on the app side: a shared
    // schema registered twice is worse than a schema registered in one place.
    const { app: appFunctionsMeta, scenario: scenarioFunctionsMeta } =
      partitionScenarioFunctionsMeta(visitState.functions.meta)
    const getUniqueName = (name: string) =>
      visitState.functions.typesMap.getUniqueName(name)
    const appSchemaNames = schemaNamesFor(appFunctionsMeta, getUniqueName)
    // `schemasFromTypes` names types the project asked for by hand, whatever
    // references them. A schema required for any other reason but referenced
    // only by scenarios exists only because a scenario needs it.
    const requestedByHand = new Set(config.schemasFromTypes ?? [])
    const scenarioOnly = new Set(
      [...schemaNamesFor(scenarioFunctionsMeta, getUniqueName)].filter(
        (name) =>
          visitState.requiredSchemas.has(name) &&
          !appSchemaNames.has(name) &&
          !requestedByHand.has(name)
      )
    )
    const appRequired = new Set(
      [...visitState.requiredSchemas].filter((name) => !scenarioOnly.has(name))
    )

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
