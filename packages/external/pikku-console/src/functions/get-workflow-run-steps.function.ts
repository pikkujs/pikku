import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRunSteps = pikkuSessionlessFunc<
  { runId: string },
  any[]
>({
  title: 'Get Workflow Run Steps',
  description:
    'Given a runId, returns an array of all execution steps for that workflow run from the Postgres workflow database via workflowRunService.getRunSteps(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) return []
    return await workflowRunService.getRunSteps(input.runId)
  },
})
