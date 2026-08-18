import { pikkuFunc } from '#pikku/addon/function'

export const deleteScenarioRun = pikkuFunc<{ runId: string }, void>({
  title: 'Delete Scenario Run',
  description:
    'Forget one scenario run and everything it recorded, including its screenshots and video.',
  expose: true,
  scopes: ['pikku:console:scenarios:manage'],
  func: async ({ scenarioRunStore }, { runId }) => {
    await scenarioRunStore?.remove(runId)
  },
})
