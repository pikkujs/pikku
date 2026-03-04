import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const graphBranchingWorkflow = pikkuWorkflowGraph({
  description: 'Branching graph: categorize then pass or fail notification',
  tags: ['graph', 'branching'],
  nodes: {
    assess: 'categorize',
    passNotify: 'sendNotification',
    failNotify: 'sendNotification',
  },
  config: {
    assess: {
      input: (ref) => ({
        score: ref('trigger', 'score'),
      }),
      next: { pass: 'passNotify', fail: 'failNotify' } as any,
    },
    passNotify: {
      input: (ref) => ({
        to: ref('trigger', 'name'),
        subject: 'Passed',
        body: 'You passed!',
      }),
    },
    failNotify: {
      input: (ref) => ({
        to: ref('trigger', 'name'),
        subject: 'Failed',
        body: 'Better luck next time.',
      }),
    },
  },
})
