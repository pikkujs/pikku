import { pikkuFunc } from '#pikku'

export const deleteWorkflowRun = pikkuFunc<
  { runId: string },
  { deleted: boolean }
>({
  title: 'Delete Workflow Run',
  description:
    'Deletes a workflow run and all its associated steps and history.',
  expose: true,
  func: async ({ workflowRunService }, input) => {
    const deleted = await workflowRunService.deleteRun(input.runId)
    return { deleted }
  },
})
