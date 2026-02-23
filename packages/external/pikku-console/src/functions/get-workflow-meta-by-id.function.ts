import { pikkuSessionlessFunc } from '#pikku'
import type { WorkflowsMeta } from '@pikku/core/workflow'

export const getWorkflowMetaById = pikkuSessionlessFunc<
  { workflowId: string },
  WorkflowsMeta[0] | null
>({
  title: 'Get Workflow by ID',
  description:
    'Given a workflowId string, reads all workflow metadata from wiringService and returns the matching workflow meta object. Returns null if no workflow matches the given ID.',
  expose: true,
  auth: false,
  func: async ({ wiringService }, input) => {
    const workflowsMeta = await wiringService.readWorkflowMeta()
    const workflow = workflowsMeta[input.workflowId]
    return workflow || null
  },
})
