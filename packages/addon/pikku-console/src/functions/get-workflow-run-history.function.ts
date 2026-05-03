import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRunHistory = pikkuSessionlessFunc<
  { runId: string },
  any[]
>({
  description:
    'Given a runId, returns the full execution history (state transitions, timestamps, errors) for a workflow run from the Postgres workflow database via workflowRunService.getRunHistory(). Returns an empty array if workflowRunService is not configured.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService)
      throw new MissingServiceError('workflowRunService is not available')
    return await workflowRunService.getRunHistory(input.runId)
  },
})
