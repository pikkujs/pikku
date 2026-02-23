import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRuns = pikkuSessionlessFunc<
  { workflowName?: string; status?: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Workflow Runs',
  description:
    'Returns a list of workflow runs from the Postgres workflow database. Accepts optional filters: workflowName, status, limit, and offset for pagination. Returns an empty array if workflowRunService is not configured.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) return []
    return await workflowRunService.listRuns({
      workflowName: input.workflowName,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    })
  },
})
