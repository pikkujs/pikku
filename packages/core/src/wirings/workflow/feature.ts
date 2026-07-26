import { pikkuState } from '../../pikku-state.js'
import type {
  CoreFeature,
  CoreWorkflow,
  FeaturePlanEntry,
} from './workflow.types.js'

/**
 * Register a feature under the name it is exported as. Called from generated
 * wiring, the same way `addWorkflow` is.
 */
export const addFeature = (
  featureId: string,
  feature: CoreFeature,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'workflows', 'features').set(featureId, feature)
}

/**
 * Resolve every feature's scenario references back to the names their
 * scenarios are registered under.
 *
 * Matching is by **object identity**: `pikkuScenario` returns its config
 * verbatim and `addWorkflow` registers that same object, so a feature holding
 * the imported identifier holds the very object that was registered. Nothing
 * is matched by shape, by name, or by any other guess — which is also why a
 * scenario built inline inside a feature (and therefore never registered)
 * comes back as unresolved rather than silently running as something else.
 *
 * Entries are returned in declaration order, features in registration order.
 * A scenario's effective tags are its own plus the containing feature's, so
 * `--tags credential` selects through the feature.
 */
export const resolveFeatureScenarios = (
  features: Map<string, CoreFeature>,
  registrations: Map<string, CoreWorkflow>
): {
  entries: FeaturePlanEntry[]
  unresolved: Array<{ featureId: string; index: number }>
} => {
  const nameByConfig = new Map<unknown, string>()
  for (const [name, registration] of registrations) {
    nameByConfig.set(registration.func, name)
  }

  const entries: FeaturePlanEntry[] = []
  const unresolved: Array<{ featureId: string; index: number }> = []

  for (const [featureId, feature] of features) {
    const scenarios = feature.scenarios ?? []
    for (let index = 0; index < scenarios.length; index++) {
      const entry = scenarios[index]!
      const paired =
        typeof entry === 'object' && entry !== null && 'scenario' in entry
      const config = paired ? (entry as any).scenario : entry
      const scenarioName = nameByConfig.get(config)
      if (!scenarioName) {
        unresolved.push({ featureId, index })
        continue
      }
      entries.push({
        featureId,
        featureName: feature.name ?? featureId,
        scenarioName,
        data: paired ? (entry as any).data : undefined,
        tags: [
          ...new Set([
            ...((registrations.get(scenarioName)?.func as any)?.tags ?? []),
            ...(feature.tags ?? []),
          ]),
        ],
      })
    }
  }

  return { entries, unresolved }
}
