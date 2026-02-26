import { pikkuSessionlessFunc } from '#pikku'

export const deleteWorkflowRun = pikkuSessionlessFunc<
  { runId: string },
  { deleted: boolean }
>({
  title: 'Delete Workflow Run',
  description:
    'Deletes a workflow run and all its associated steps and history.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) return { deleted: false }
    const deleted = await workflowRunService.deleteRun(input.runId)
    return { deleted }
  },
})
