import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const getWorkflowRunHistory = pikkuFunc<
  { runId: string },
  any[]
>({
  title: 'Get Workflow Run History',
  description:
    'Given a runId, returns the full execution history (state transitions, timestamps, errors) for a workflow run from the Postgres workflow database via workflowRunService.getRunHistory(). Throws MissingServiceError if workflowRunService is not configured.',
  expose: true,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService)
      throw new MissingServiceError('workflowRunService is not available')
    return await workflowRunService.getRunHistory(input.runId)
  },
})
