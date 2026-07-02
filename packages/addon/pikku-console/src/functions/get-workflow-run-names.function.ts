import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const getWorkflowRunNames = pikkuFunc<null, string[]>({
  title: 'Get Workflow Run Names',
  description:
    'Returns an array of distinct workflow names that have at least one run in the Postgres workflow database via workflowRunService.getDistinctWorkflowNames(). Throws MissingServiceError if workflowRunService is not configured.',
  expose: true,
  func: async ({ workflowRunService }) => {
    if (!workflowRunService)
      throw new MissingServiceError('workflowRunService is not available')
    return await workflowRunService.getDistinctWorkflowNames()
  },
})
