import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphUnhappyRetryWorkflow = pikkuWorkflowGraph({
  name: 'graphUnhappyRetryWorkflow',
  tags: ['test', 'retry', 'unhappy'],
  nodes: {
    step_that_always_fails: 'alwaysFailsRPC',
  },
  config: {
    step_that_always_fails: {
      input: (ref, template) => ({
        $passthrough: ref('trigger'),
      }),
    },
  },
})
