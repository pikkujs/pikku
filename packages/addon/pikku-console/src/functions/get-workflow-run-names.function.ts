import { pikkuFunc } from '#pikku'

export const getWorkflowRunNames = pikkuFunc<null, string[]>({
  title: 'Get Workflow Run Names',
  description:
    'Returns an array of distinct workflow names that have at least one run in the Postgres workflow database via workflowRunService.getDistinctWorkflowNames().',
  expose: true,
  func: async ({ workflowRunService }) => {
    return await workflowRunService.getDistinctWorkflowNames()
  },
})
