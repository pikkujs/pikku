import type { FunctionsMeta } from '@pikku/core'
import { partitionScenarioFunctionsMeta } from './scenario-partition.js'

/**
 * The schema names a set of functions validates against.
 *
 * `getUniqueName` is the inspector's own type→schema naming, so this resolves a
 * name the same way `computeRequiredSchemas` did when it filled `requiredSchemas`.
 * The two must not disagree: a scenario schema this failed to name would stay on
 * the app side, which is the leak the split exists to close.
 */
export const schemaNamesFor = (
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

/**
 * Split the required schemas into the app's register and the scenario register.
 *
 * A scenario's input/output schemas are as test-only as its body, and the app's
 * `register.gen.ts` is imported by every deployed bundle — on one project half the
 * registered schemas belonged to scenarios and steps. Both sets are derived from
 * `requiredSchemas`, so every name lands in exactly one register and a name the
 * scenario side claims is removed from the app side by construction.
 *
 * Two things deliberately stay on the app side: a schema an application function
 * also needs (registering a shared schema twice is worse than registering it in
 * one place), and a type the project asked for by hand via `schemasFromTypes`,
 * whatever happens to reference it.
 */
export const partitionRequiredSchemas = ({
  functionsMeta,
  requiredSchemas,
  getUniqueName,
  schemasFromTypes,
}: {
  functionsMeta: FunctionsMeta
  requiredSchemas: Set<string>
  getUniqueName: (name: string) => string
  schemasFromTypes?: string[]
}): { appRequired: Set<string>; scenarioOnly: Set<string> } => {
  const { app: appFunctionsMeta, scenario: scenarioFunctionsMeta } =
    partitionScenarioFunctionsMeta(functionsMeta)
  const appSchemaNames = schemaNamesFor(appFunctionsMeta, getUniqueName)
  const requestedByHand = new Set(schemasFromTypes ?? [])

  const scenarioOnly = new Set(
    [...schemaNamesFor(scenarioFunctionsMeta, getUniqueName)].filter(
      (name) =>
        requiredSchemas.has(name) &&
        !appSchemaNames.has(name) &&
        !requestedByHand.has(name)
    )
  )
  const appRequired = new Set(
    [...requiredSchemas].filter((name) => !scenarioOnly.has(name))
  )

  return { appRequired, scenarioOnly }
}
