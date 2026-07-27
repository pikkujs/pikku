import { resolveFeatureScenarios } from '@pikku/core/workflow'
import type { CoreFeature, CoreWorkflow } from '@pikku/core/workflow'

/** One scenario run: a scenario name and, for a feature's paired entry, its input. */
export type ScenarioPlanEntry = {
  scenarioName: string
  data?: unknown
  tags: string[]
  /**
   * Why this scenario is not part of a default run. It stays in the plan so
   * the runner reports it as skipped rather than omitting it silently, and it
   * is cleared when the scenario is named directly with `--flows` — the
   * explicit ask that overrides the quarantine.
   */
  skip?: string
}

/**
 * A run unit. A feature is one group whose hooks run once around all of its
 * entries; a scenario belonging to no feature is a group of one with no hooks.
 */
export type ScenarioPlanGroup = {
  featureId?: string
  featureName?: string
  before?: CoreFeature['before']
  after?: CoreFeature['after']
  entries: ScenarioPlanEntry[]
}

export type ScenarioPlanInput = {
  /** Scenarios the inspector found, in declaration order. */
  scenarios: Array<{ name: string; tags: string[]; skip?: string }>
  features: Map<string, CoreFeature>
  registrations: Map<string, CoreWorkflow>
  flows?: string[]
  featureIds?: string[]
  tags?: string[]
}

export type ScenarioPlan = {
  groups: ScenarioPlanGroup[]
  /** Feature entries whose scenario is not registered — reported, never skipped silently. */
  unresolved: Array<{ featureId: string; index: number }>
}

/**
 * Turn the registered scenarios and features into an ordered list of run units.
 *
 * Features come first, in registration order, then the scenarios that belong to
 * no feature, in declaration order. Selection is a filter over that plan rather
 * than a different traversal, so `--tags` narrowing a feature to two of its
 * five scenarios still runs the feature's hooks exactly once around those two.
 */
export const buildScenarioPlan = ({
  scenarios,
  features,
  registrations,
  flows,
  featureIds,
  tags,
}: ScenarioPlanInput): ScenarioPlan => {
  const { entries, unresolved } = resolveFeatureScenarios(
    features,
    registrations
  )

  if (flows) {
    const known = new Set(scenarios.map((s) => s.name))
    const unknown = flows.filter((name) => !known.has(name))
    if (unknown.length > 0) {
      throw new Error(
        `Unknown scenario(s): ${unknown.join(', ')}. Available: ${scenarios
          .map((s) => s.name)
          .join(', ')}`
      )
    }
    // A scenario every one of whose feature entries carries `data` has no input
    // to run with when it is named directly — the feature is what supplies it,
    // so the feature is what runs. A scenario referenced bare anywhere, or in no
    // feature at all, runs standalone exactly as before.
    for (const name of flows) {
      const appearances = entries.filter((e) => e.scenarioName === name)
      if (appearances.length === 0) continue
      if (appearances.some((e) => e.data === undefined)) continue
      const containing = [...new Set(appearances.map((e) => e.featureId))]
      throw new Error(
        `Scenario '${name}' is only ever run with data supplied by a feature, so there is nothing to run it with on its own — run the feature instead: --features ${containing.join(',')}`
      )
    }
  }

  if (featureIds) {
    const unknown = featureIds.filter((id) => !features.has(id))
    if (unknown.length > 0) {
      throw new Error(
        `Unknown feature(s): ${unknown.join(', ')}. Available: ${[...features.keys()].join(', ') || '(none)'}`
      )
    }
  }

  const skipReasons = new Map(
    scenarios
      .filter((scenario) => scenario.skip)
      .map((scenario) => [scenario.name, scenario.skip!])
  )

  const wantedFlows = flows ? new Set(flows) : undefined
  const wantedFeatures = featureIds ? new Set(featureIds) : undefined
  const wantedTags = tags ? new Set(tags) : undefined

  // Naming a scenario with `--flows` is the explicit ask that overrides its
  // quarantine; narrowing to its feature is not — a feature is a group, and
  // running the group should not silently drag a quarantined member in.
  const skipFor = (scenarioName: string): string | undefined =>
    wantedFlows?.has(scenarioName) ? undefined : skipReasons.get(scenarioName)

  const keep = (entry: ScenarioPlanEntry, featureId?: string): boolean => {
    if (wantedFeatures && !(featureId && wantedFeatures.has(featureId))) {
      return false
    }
    if (wantedFlows && !wantedFlows.has(entry.scenarioName)) {
      return false
    }
    if (wantedTags && !entry.tags.some((tag) => wantedTags.has(tag))) {
      return false
    }
    return true
  }

  const groups: ScenarioPlanGroup[] = []

  for (const [featureId, feature] of features) {
    const kept = entries
      .filter((entry) => entry.featureId === featureId)
      .map(({ scenarioName, data, tags: entryTags }) => ({
        scenarioName,
        data,
        tags: entryTags,
        skip: skipFor(scenarioName),
      }))
      .filter((entry) => keep(entry, featureId))
    if (kept.length === 0) continue
    groups.push({
      featureId,
      featureName: feature.name ?? featureId,
      before: feature.before,
      after: feature.after,
      entries: kept,
    })
  }

  const inAFeature = new Set(entries.map((entry) => entry.scenarioName))
  for (const scenario of scenarios) {
    if (inAFeature.has(scenario.name)) continue
    const entry = {
      scenarioName: scenario.name,
      tags: scenario.tags,
      skip: skipFor(scenario.name),
    }
    if (!keep(entry)) continue
    groups.push({ entries: [entry] })
  }

  return { groups, unresolved }
}
