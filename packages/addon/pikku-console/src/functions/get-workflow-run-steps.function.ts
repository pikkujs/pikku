import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRunSteps = pikkuSessionlessFunc<
  { runId: string },
  any[]
>({
  description:
    'Given a runId, returns an array of all execution steps for that workflow run from the Postgres workflow database via workflowRunService.getRunSteps(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService)
      throw new MissingServiceError('workflowRunService is not available')
    return await workflowRunService.getRunSteps(input.runId)
  },
})
