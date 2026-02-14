import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphOrderProcessingWorkflow = pikkuWorkflowGraph({
  name: 'graphOrderProcessingWorkflow',
  nodes: {
    create_order: 'orderCreate',
    process_payment: 'paymentProcess',
    update_order_to_paid: 'orderUpdate',
    send_order_confirmation: 'emailSend',
    update_order_to_payment_failed: 'orderUpdate',
  },
  config: {
    create_order: {
      next: 'process_payment',
      input: (ref, template) => ({
        customerId: ref('trigger', 'customerId'),
        items: ref('trigger', 'items'),
      }),
    },
    process_payment: {
      input: (ref, template) => ({
        orderId: ref('create_order', 'id'),
        amount: ref('create_order', 'total'),
        currency: 'USD',
        paymentMethodId: ref('trigger', 'paymentMethodId'),
      }),
    },
    update_order_to_paid: {
      next: 'send_order_confirmation',
      input: (ref, template) => ({
        orderId: ref('create_order', 'id'),
        status: 'paid',
      }),
    },
    send_order_confirmation: {
      input: (ref, template) => ({
        to: template('customer-$0@example.com', [ref('trigger', 'customerId')]),
        subject: template('Order $0 Confirmed', [ref('create_order', 'id')]),
        body: template('Your order for $$0 has been confirmed.', [
          ref('create_order', 'total'),
        ]),
      }),
    },
    update_order_to_payment_failed: {
      input: (ref, template) => ({
        orderId: ref('create_order', 'id'),
        status: 'payment_failed',
      }),
    },
  },
})
