import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphRetryWithBackoffWorkflow = pikkuWorkflowGraph({
  name: 'graphRetryWithBackoffWorkflow',
  nodes: {
    send_notification_with_retry: 'notifyEmail',
  },
  config: {
    send_notification_with_retry: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        subject: 'Important Message',
        body: ref('trigger', 'message'),
      }),
    },
  },
})
