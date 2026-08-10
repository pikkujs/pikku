import { pikkuState } from '../../pikku-state.js'
import type {
  CoreFeature,
  CoreWorkflow,
  FeaturePlanEntry,
} from './workflow.types.js'

export const addFeature = (
  featureId: string,
  feature: CoreFeature,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'workflows', 'features').set(featureId, feature)
}

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
      const pairing =
        typeof entry === 'object' && entry !== null && 'scenario' in entry
          ? (entry as { scenario: unknown; data?: unknown })
          : undefined
      const config = pairing ? pairing.scenario : entry
      const scenarioName = nameByConfig.get(config)
      if (!scenarioName) {
        unresolved.push({ featureId, index })
        continue
      }
      entries.push({
        featureId,
        featureName: feature.name ?? featureId,
        scenarioName,
        data: pairing?.data,
        tags: [
          ...new Set([
            ...((registrations.get(scenarioName)?.func as { tags?: string[] })
              ?.tags ?? []),
            ...(feature.tags ?? []),
          ]),
        ],
      })
    }
  }

  return { entries, unresolved }
}
