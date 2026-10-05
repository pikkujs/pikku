import { pikkuFunc } from '#pikku/addon/function'
import { addonNames } from '../lib/addon-scope.js'
import type { AddonFilter } from '../lib/addon-scope.js'

export const getWorkflowRunNames = pikkuFunc<AddonFilter | null, string[]>({
  title: 'Get Workflow Run Names',
  description:
    "Returns an array of distinct workflow names that have at least one run in the Postgres workflow database via workflowRunService.getDistinctWorkflowNames(). With `addon`, only that add-on's workflows.",
  expose: true,
  scopes: ['pikku:console:workflows:read'],
  func: async ({ workflowRunService }, input) => {
    return addonNames(
      await workflowRunService.getDistinctWorkflowNames(),
      input?.addon
    )
  },
})
