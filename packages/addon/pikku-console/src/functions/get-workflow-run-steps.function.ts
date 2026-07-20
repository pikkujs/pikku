import { pikkuFunc } from '#pikku'

export const getWorkflowRunSteps = pikkuFunc<{ runId: string }, any[]>({
  title: 'Get Workflow Run Steps',
  description:
    'Given a runId, returns an array of all execution steps for that workflow run from the Postgres workflow database via workflowRunService.getRunSteps(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  func: async ({ workflowRunService }, input) => {
    return await workflowRunService.getRunSteps(input.runId)
  },
})
