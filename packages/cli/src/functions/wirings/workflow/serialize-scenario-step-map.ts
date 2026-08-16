/**
 * Generate the scenario step map: the typed set of names a scenario may pass to
 * `scenario.given/when/then`.
 *
 * Steps are referenced by string, exactly like `workflow.do` references an RPC,
 * so type safety has to come from a generated map rather than from importing
 * the step's const. This is what makes `scenario.given('…', 'buysAnApple', …)`
 * autocomplete and type-check its data.
 */
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { type TypesMap, generateCustomTypes } from '@pikku/inspector'
import type { FunctionsMeta, Logger } from '@pikku/core/services'

/**
 * All three step wrappers. A scenario calls a platform or addon step by name
 * exactly as it calls a persona one — who acts changes what the step may do, not
 * how it is referenced — so all three belong in the map.
 */
const SCENARIO_STEP_WRAPPERS = new Set([
  'pikkuScenarioStep',
  'pikkuPlatformScenarioStep',
  'pikkuAddonScenarioStep',
])

export const serializeScenarioStepMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta
) => {
  const requiredTypes = new Set<string>()

  const steps = Object.entries(functionsMeta).filter(
    ([, meta]) =>
      !!meta.funcWrapper && SCENARIO_STEP_WRAPPERS.has(meta.funcWrapper)
  )

  const resolveType = (name: string | undefined) => {
    if (!name) {
      return 'void'
    }
    try {
      return typesMap.getTypeMeta(name).uniqueName
    } catch {
      return name
    }
  }

  let stepsStr = 'export type FlattenedScenarioStepMap = {\n'
  for (const [stepName, meta] of steps) {
    const inputType = resolveType(meta.inputs?.[0])
    const outputType = resolveType(meta.outputs?.[0])
    requiredTypes.add(inputType)
    requiredTypes.add(outputType)
    stepsStr += `  readonly '${stepName}': ScenarioStepHandler<${inputType}, ${outputType}>,\n`
  }
  stepsStr += '};'

  const hasAny = steps.length > 0
  const serializedCustomTypes = hasAny
    ? generateCustomTypes(typesMap, requiredTypes)
    : ''

  const serializedImportMap = hasAny
    ? serializeImportMap(
        logger,
        relativeToPath,
        packageMappings,
        typesMap,
        requiredTypes
      )
    : ''

  const serializedCustomTypesDeclarationsOnly = serializedCustomTypes
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n')

  return `/**
 * Scenario step map: the names \`scenario.given/when/then\` accepts, with
 * the input and output types of each step.
 */

${serializedImportMap}
${serializedCustomTypesDeclarationsOnly}

interface ScenarioStepHandler<I, O> {
    input: I;
    output: O;
}

${stepsStr}
`
}
