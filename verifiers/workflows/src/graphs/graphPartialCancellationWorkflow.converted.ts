import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphPartialCancellationWorkflow = pikkuWorkflowGraph({
  name: 'graphPartialCancellationWorkflow',
  nodes: {
    get_order: 'orderGet',
    process_partial_refund: 'paymentRefund',
    send_partial_cancellation_email: 'emailSend',
  },
  config: {
    get_order: {
      next: 'send_partial_cancellation_email',
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
      }),
    },
    process_partial_refund: {
      next: 'send_partial_cancellation_email',
      input: (ref, template) => ({
        paymentId: template('payment-$0', [ref('trigger', 'orderId')]),
        amount: ref('trigger', 'refundAmount'),
        reason: ref('trigger', 'reason'),
      }),
    },
    send_partial_cancellation_email: {
      input: (ref, template) => ({
        to: template('customer-$0@example.com', [
          ref('get_order', 'customerId'),
        ]),
        subject: template('Partial Order Update - $0', [
          ref('trigger', 'orderId'),
        ]),
        body: template('$0 item(s) cancelled. Refund: $$1', [
          { $ref: 'itemsCancelled.length' } as any,
          ref('trigger', 'refundAmount'),
        ]),
      }),
    },
  },
})
