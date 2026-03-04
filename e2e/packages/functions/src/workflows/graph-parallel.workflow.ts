import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const graphParallelWorkflow = pikkuWorkflowGraph({
  description: 'Parallel graph: double then email and sms in parallel',
  tags: ['graph', 'parallel'],
  nodes: {
    start: 'doubleValue',
    emailNotify: 'sendNotification',
    smsNotify: 'sendNotification',
  },
  config: {
    start: {
      input: (ref) => ({
        value: ref('trigger', 'value'),
      }),
      next: ['emailNotify', 'smsNotify'],
    },
    emailNotify: {
      input: (ref) => ({
        to: ref('trigger', 'name'),
        subject: 'Email notification',
        body: 'Workflow started',
      }),
    },
    smsNotify: {
      input: (ref) => ({
        to: ref('trigger', 'name'),
        subject: 'SMS notification',
        body: 'Workflow started',
      }),
    },
  },
})
