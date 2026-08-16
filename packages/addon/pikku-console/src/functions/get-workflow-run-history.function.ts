import { pikkuFunc } from '#pikku/function'

export const getWorkflowRunHistory = pikkuFunc<{ runId: string }, any[]>({
  title: 'Get Workflow Run History',
  description:
    'Given a runId, returns the full execution history (state transitions, timestamps, errors) for a workflow run from the Postgres workflow database via workflowRunService.getRunHistory().',
  expose: true,
  scopes: ['pikku:console:workflows:read'],
  func: async ({ workflowRunService }, input) => {
    return await workflowRunService.getRunHistory(input.runId)
  },
})
