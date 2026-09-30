import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

// The graph twin of `runLeaseContentionWorkflow`: a `forEach` fan-out whose
// items all finish at `releaseAt`.
export const graphRunLeaseContention = pikkuWorkflowGraph({
  description: 'Graph fan-out whose items all finish at the same instant',
  tags: ['test', 'lease'],
  nodes: {
    list: 'contentionItems',
    square: 'contentionStep',
    total: 'contentionSum',
  },
  config: {
    list: {
      input: (ref) => ({
        width: ref('trigger', 'width'),
        releaseAt: ref('trigger', 'releaseAt'),
      }),
      next: 'square',
    },
    square: {
      forEach: (ref) => ref('list', 'items'),
      input: (ref, template, $item) => ({
        index: $item('index'),
        releaseAt: $item('releaseAt'),
      }),
      next: 'total',
    },
    total: {
      input: (ref) => ({ results: ref('square') }),
    },
  },
})
