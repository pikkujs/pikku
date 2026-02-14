import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTripleNestedLoopWorkflow = pikkuWorkflowGraph({
  name: 'graphTripleNestedLoopWorkflow',
  tags: ['patterns'],
  nodes: {
    process_org_org_orgid: 'projectGet',
  },
})
