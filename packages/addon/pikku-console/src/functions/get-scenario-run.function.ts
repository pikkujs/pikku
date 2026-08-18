import { pikkuFunc } from '#pikku/addon/function'
import type { ScenarioRunRecord } from '@pikku/core/scenario'

export const getScenarioRun = pikkuFunc<
  { runId: string },
  ScenarioRunRecord | null
>({
  title: 'Get Scenario Run',
  description:
    'One scenario run in full: every scenario it ran, the step ladder as it was worded at the time, why anything failed, and the screenshots and video each scenario produced.',
  expose: true,
  scopes: ['pikku:console:scenarios:read'],
  func: async ({ scenarioRunStore }, { runId }) => {
    if (!scenarioRunStore) {
      return null
    }
    return (await scenarioRunStore.get(runId)) ?? null
  },
})
