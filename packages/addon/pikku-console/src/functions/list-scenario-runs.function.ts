import { pikkuFunc } from '#pikku'
import type { ScenarioRunSummary } from '@pikku/core/ecosystem/scenario'

export const listScenarioRuns = pikkuFunc<
  { limit?: number },
  ScenarioRunSummary[]
>({
  title: 'List Scenario Runs',
  description:
    'Past `pikku scenario run` invocations, newest first, each summarised with its outcome, counts and how many artifacts it left. Empty when the project has never run a scenario.',
  expose: true,
  scopes: ['pikku:console:scenarios:read'],
  func: async ({ scenarioRunStore }, input) => {
    if (!scenarioRunStore) {
      return []
    }
    return scenarioRunStore.list({ limit: input?.limit ?? 50 })
  },
})
