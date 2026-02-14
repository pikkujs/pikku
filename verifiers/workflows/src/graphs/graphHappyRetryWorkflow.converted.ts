import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphHappyRetryWorkflow = pikkuWorkflowGraph({
  name: 'graphHappyRetryWorkflow',
  nodes: {
    step_that_fails_once_then_succeeds: 'flakyHappyRPC',
  },
  config: {
    step_that_fails_once_then_succeeds: {
      input: (ref, template) => ({
        $passthrough: ref('trigger'),
      }),
    },
  },
})
