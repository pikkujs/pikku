import type {
  ScenarioResult,
  ScenarioRunRecord,
  ScenarioStepRow,
} from '@pikku/core/scenario'
import type {
  FeatureDoc,
  ScenarioDoc,
  ScenarioLadderStep,
} from './scenario-doc-model'

/**
 * What a scenario looks like through a chosen run.
 *
 * Five states rather than the record's three, because the suite and the run are
 * read together: a scenario the selected run has not reached yet is `waiting`,
 * and one no run has ever reached is `never` — two different silences that a
 * single "no result" cannot tell apart.
 */
export type ScenarioLensStatus =
  'passed' | 'failed' | 'running' | 'waiting' | 'never'

export interface ScenarioFeatureTally {
  passed: number
  failed: number
  running: number
  waiting: number
  never: number
}

export interface ScenarioRunLens {
  runId: string
  /** True while the run is still going, which is what makes `waiting` honest. */
  live: boolean
  /**
   * The result to read this scenario by. A feature that parameterises one
   * scenario files a result per `Examples:` row while the document collapses
   * them into one section, so the failure wins — it is the one worth reading.
   */
  resultFor(scenario: ScenarioDoc): ScenarioResult | undefined
  statusFor(scenario: ScenarioDoc): ScenarioLensStatus
  tally(feature: FeatureDoc): ScenarioFeatureTally
}

const RANK: Record<string, number> = { failed: 0, running: 1, passed: 2 }

const worst = (results: ScenarioResult[]): ScenarioResult | undefined =>
  [...results].sort((a, b) => (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3))[0]

export const buildScenarioRunLens = (
  run: ScenarioRunRecord
): ScenarioRunLens => {
  const byScenario = new Map<string, ScenarioResult[]>()
  for (const result of run.results) {
    const key = result.scenarioName ?? result.name
    const list = byScenario.get(key) ?? []
    list.push(result)
    byScenario.set(key, list)
  }

  const live = run.status === 'running'
  const resultFor = (scenario: ScenarioDoc) =>
    worst(byScenario.get(scenario.name) ?? [])

  const statusFor = (scenario: ScenarioDoc): ScenarioLensStatus => {
    const result = resultFor(scenario)
    if (result) return result.status as ScenarioLensStatus
    return live ? 'waiting' : 'never'
  }

  return {
    runId: run.runId,
    live,
    resultFor,
    statusFor,
    tally: (feature) => {
      const counted: ScenarioFeatureTally = {
        passed: 0,
        failed: 0,
        running: 0,
        waiting: 0,
        never: 0,
      }
      const seen = new Set<string>()
      for (const entry of feature.scenarios) {
        if (seen.has(entry.scenario.name)) continue
        seen.add(entry.scenario.name)
        counted[statusFor(entry.scenario)] += 1
      }
      return counted
    },
  }
}

/**
 * The lens a screen uses when no run is chosen: the suite as written, with
 * nothing claimed about how it went.
 */
export const DECLARED_LENS: ScenarioRunLens = {
  runId: '',
  live: false,
  resultFor: () => undefined,
  statusFor: () => 'never',
  tally: (feature) => ({
    passed: 0,
    failed: 0,
    running: 0,
    waiting: 0,
    never: new Set(feature.scenarios.map((entry) => entry.scenario.name)).size,
  }),
}

/**
 * The declared ladder joined to what the run recorded, keyed by ladder step id.
 *
 * Matched on the sentence and scanned forwards rather than zipped by index: a
 * repeat header declares a rung the run never files, and a scenario that
 * stopped early files fewer rungs than it declares. Walking forwards keeps a
 * repeated sentence attached to the right occurrence of it.
 */
export const alignLadderToRun = (
  declared: ScenarioLadderStep[],
  recorded: ScenarioStepRow[]
): Map<string, ScenarioStepRow> => {
  const aligned = new Map<string, ScenarioStepRow>()
  let cursor = 0
  for (const step of declared) {
    if (step.repeat) continue
    const at = recorded.findIndex(
      (row, index) => index >= cursor && row.sentence === step.sentence
    )
    if (at === -1) continue
    aligned.set(step.id, recorded[at]!)
    cursor = at + 1
  }
  return aligned
}

/**
 * Where a declared rung starts inside the scenario's recording: the sum of
 * everything the run recorded before it, which is also how the footage was
 * laid down.
 */
export const ladderOffset = (
  declared: ScenarioLadderStep[],
  recorded: Map<string, ScenarioStepRow> | undefined,
  stepId: string
): number | undefined => {
  if (!recorded) return undefined
  let elapsed = 0
  for (const step of declared) {
    if (step.id === stepId) return elapsed
    elapsed += recorded.get(step.id)?.durationMs ?? 0
  }
  return undefined
}
