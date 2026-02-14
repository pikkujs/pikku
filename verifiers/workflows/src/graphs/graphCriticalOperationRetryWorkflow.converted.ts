import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphCriticalOperationRetryWorkflow = pikkuWorkflowGraph({
  name: 'graphCriticalOperationRetryWorkflow',
  nodes: {
    critical_payment_capture: 'paymentCapture',
    notify_success: 'notifySlack',
  },
  config: {
    critical_payment_capture: {
      next: 'notify_success',
      input: (ref, template) => ({
        paymentId: ref('trigger', 'operationId'),
        amount: 1000,
      }),
    },
    notify_success: {
      input: (ref, template) => ({
        channel: '#payments',
        message: template('Critical operation $0 completed successfully', [
          ref('trigger', 'operationId'),
        ]),
      }),
    },
  },
})
