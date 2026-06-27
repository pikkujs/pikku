import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

// A graph with a node that cycles back to itself (`attempt --again--> attempt`)
// until it converges, then exits to `finish`. `begin` is the (non-cyclic) entry
// so the run has somewhere to start — a pure cycle has no entry node.
export const graphCyclicRetry = pikkuWorkflowGraph({
  description: 'Cyclic graph: a node loops back to itself until it converges',
  tags: ['cyclic', 'graph'],
  nodes: {
    begin: 'cyclicBegin',
    attempt: 'cyclicAttempt',
    finish: 'cyclicFinish',
  },
  config: {
    begin: {
      next: 'attempt',
    },
    attempt: {
      input: (ref) => ({ target: ref('begin', 'attempts') }),
      next: { again: 'attempt', done: 'finish' },
    },
    finish: {
      input: (ref) => ({ target: ref('begin', 'attempts') }),
    },
  },
})
