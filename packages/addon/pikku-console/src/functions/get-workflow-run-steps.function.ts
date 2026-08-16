import { pikkuFunc } from '#pikku/function'

export const getWorkflowRunSteps = pikkuFunc<{ runId: string }, any[]>({
  title: 'Get Workflow Run Steps',
  description:
    'Given a runId, returns an array of all execution steps for that workflow run from the Postgres workflow database via workflowRunService.getRunSteps(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  scopes: ['pikku:console:workflows:read'],
  func: async ({ workflowRunService }, input) => {
    return await workflowRunService.getRunSteps(input.runId)
  },
})
