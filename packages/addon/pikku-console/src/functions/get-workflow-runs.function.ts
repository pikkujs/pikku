import { pikkuFunc } from '#pikku/addon/function'
import { addonNames, pageOf } from '../lib/addon-scope.js'
import type { AddonFilter } from '../lib/addon-scope.js'

export const getWorkflowRuns = pikkuFunc<
  {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  } & AddonFilter,
  any[]
>({
  title: 'Get Workflow Runs',
  description:
    "Returns a list of workflow runs from the Postgres workflow database. Accepts optional filters: workflowName, status, limit, and offset for pagination. With `addon`, only runs of that add-on's workflows are returned. Returns an empty array if workflowRunService is not configured.",
  expose: true,
  scopes: ['pikku:console:workflows:read'],
  func: async ({ workflowRunService }, input) => {
    if (!input?.addon) {
      return await workflowRunService.listRuns({
        workflowName: input?.workflowName,
        status: input?.status,
        limit: input?.limit,
        offset: input?.offset,
      })
    }
    const names = addonNames(
      await workflowRunService.getDistinctWorkflowNames(),
      input.addon
    ).filter((name) => !input.workflowName || name === input.workflowName)
    const runs = (
      await Promise.all(
        names.map((workflowName) =>
          workflowRunService.listRuns({ workflowName, status: input.status })
        )
      )
    ).flat()
    runs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    return pageOf(runs, input)
  },
})
