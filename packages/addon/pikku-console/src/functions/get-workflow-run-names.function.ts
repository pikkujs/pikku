import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRunNames = pikkuSessionlessFunc<null, string[]>({
  title: 'Get Workflow Run Names',
  description:
    'Returns an array of distinct workflow names that have at least one run in the Postgres workflow database via workflowRunService.getDistinctWorkflowNames(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }) => {
    if (!workflowRunService) return []
    return await workflowRunService.getDistinctWorkflowNames()
  },
})
