import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const graphLinearWorkflow = pikkuWorkflowGraph({
  description: 'Linear graph: double then format then notify',
  tags: ['graph', 'linear'],
  nodes: {
    double: 'doubleValue',
    format: 'formatMessage',
    notify: 'sendNotification',
  },
  config: {
    double: {
      input: (ref) => ({
        value: ref('trigger', 'value'),
      }),
      next: 'format',
    },
    format: {
      input: (ref) => ({
        greeting: 'Hello',
        name: ref('trigger', 'name'),
      }),
      next: 'notify',
    },
    notify: {
      input: (ref) => ({
        to: ref('trigger', 'name'),
        subject: 'Done',
        body: ref('format', 'message'),
      }),
    },
  },
})
