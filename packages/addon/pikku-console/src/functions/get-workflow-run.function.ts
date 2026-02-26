import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowRun = pikkuSessionlessFunc<
  { runId: string },
  Record<string, unknown> | null
>({
  title: 'Get Workflow Run',
  description:
    'Given a runId, fetches a single workflow run from workflowRunService and also fetches all its steps, returning the run object merged with a steps array. Returns null if workflowRunService is not configured or the run is not found.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) return null
    const run = await workflowRunService.getRun(input.runId)
    if (!run) return null
    const steps = await workflowRunService.getRunSteps(input.runId)
    return { ...run, steps }
  },
})
