import { pikkuSessionlessFunc } from '#pikku'
import { createHash } from 'node:crypto'
import { getSingletonServices } from '@pikku/core'

export const storeDynamicWorkflow = pikkuSessionlessFunc<
  {
    name: string
    nodes: Record<string, any>
    workflowDescription: string
    entryNodeIds: string[]
  },
  { workflowName: string; graphHash: string }
>({
  expose: true,
  description: 'Hashes and stores a validated workflow graph',
  func: async ({}, { name, nodes, workflowDescription, entryNodeIds }) => {
    const workflowName = name
    const canonical = JSON.stringify(
      { nodes, entryNodeIds },
      Object.keys({ nodes, entryNodeIds }).sort()
    )
    const graphHash = createHash('sha256')
      .update(canonical)
      .digest('hex')
      .slice(0, 16)

    const graph = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dynamic-workflow',
      description: workflowDescription,
      nodes,
      entryNodeIds,
      graphHash,
    }

    const singletonServices = getSingletonServices() as any
    if (singletonServices?.workflowService) {
      await singletonServices.workflowService.upsertWorkflowVersion(
        workflowName,
        graphHash,
        graph,
        'dynamic-workflow',
        'active'
      )
    }

    return { workflowName, graphHash }
  },
})
