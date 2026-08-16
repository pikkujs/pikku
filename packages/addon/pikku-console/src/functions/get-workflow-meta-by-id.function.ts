import { pikkuFunc } from '#pikku/function'
import type { WorkflowsMeta } from '@pikku/core/ecosystem/workflow'

export const getWorkflowMetaById = pikkuFunc<
  { workflowId: string },
  WorkflowsMeta[0] | null
>({
  title: 'Get Workflow by ID',
  description:
    'Given a workflowId string, reads all workflow metadata from wiringService and returns the matching workflow meta object. Returns null if no workflow matches the given ID.',
  expose: true,
  scopes: ['pikku:console:workflows:read'],
  func: async ({ metaService }, input) => {
    const workflowsMeta = await metaService.getWorkflowMeta()
    return workflowsMeta[input.workflowId] ?? null
  },
})
