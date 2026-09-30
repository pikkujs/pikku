import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

// The graph twin of `crashReclaimWorkflow`, driven through the graph runner
// instead of the DSL.
export const crashReclaimGraph = pikkuWorkflowGraph({
  description: 'Graph whose only node can take its worker down with it',
  tags: ['test', 'crash', 'graph'],
  nodes: {
    crash: 'crashProneStep',
  },
  config: {
    crash: {
      input: (ref) => ({ crashes: ref('trigger', 'crashes') }),
    },
  },
})
