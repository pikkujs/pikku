import { pikkuSessionlessFunc } from '#pikku'
import type { WorkflowsMeta } from '@pikku/core/workflow'

export const getWorkflowMetaById = pikkuSessionlessFunc<
  { workflowId: string },
  WorkflowsMeta[0] | null
>({
  description:
    'Given a workflowId string, reads all workflow metadata from wiringService and returns the matching workflow meta object. Falls back to the workflow store for AI-agent generated workflows. Returns null if no workflow matches the given ID.',
  expose: true,
  auth: false,
  func: async ({ metaService, workflowService }, input) => {
    const workflowsMeta = await metaService.getWorkflowMeta()
    const workflow = workflowsMeta[input.workflowId]
    if (workflow) return workflow

    if (workflowService) {
      const aiWorkflows = await workflowService.getAIGeneratedWorkflows()
      const match = aiWorkflows.find((w) => w.workflowName === input.workflowId)
      if (match) {
        return {
          name: match.workflowName,
          pikkuFuncId: match.workflowName,
          steps: [],
          source: 'ai-agent',
          nodes: match.graph?.nodes,
          entryNodeIds: match.graph?.entryNodeIds,
          graphHash: match.graphHash,
        } as any
      }
    }

    return null
  },
})
