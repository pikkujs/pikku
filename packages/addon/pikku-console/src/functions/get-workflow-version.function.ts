import { pikkuSessionlessFunc } from '#pikku'

export const getWorkflowVersion = pikkuSessionlessFunc<
  { name: string; graphHash: string },
  { graph: any; source: string } | null
>({
  title: 'Get Workflow Version',
  description:
    'Given a workflow name and graphHash, looks up the specific workflow version from the Postgres workflow database via workflowRunService.getWorkflowVersion() and returns the workflow graph definition and source code. Returns null if workflowRunService is not configured or the version is not found.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) return null
    return await workflowRunService.getWorkflowVersion(
      input.name,
      input.graphHash
    )
  },
})
