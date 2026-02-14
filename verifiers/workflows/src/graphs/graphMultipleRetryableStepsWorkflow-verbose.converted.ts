import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphMultipleRetryableStepsWorkflow = pikkuWorkflowGraph({
  name: 'graphMultipleRetryableStepsWorkflow',
  tags: ['patterns'],
  nodes: {
    process_payment: 'paymentProcess',
    reserve_inventory: 'inventoryReserve',
    send_confirmation: 'notifyEmail',
  },
  config: {
    process_payment: {
      next: 'reserve_inventory',
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
        amount: 100,
        currency: 'USD',
        paymentMethodId: ref('trigger', 'paymentMethodId'),
      }),
    },
    reserve_inventory: {
      next: 'send_confirmation',
      input: (ref, template) => ({
        productId: 'prod-1',
        quantity: 1,
        orderId: ref('trigger', 'orderId'),
      }),
    },
    send_confirmation: {
      input: () => ({
        userId: 'customer-1',
        subject: 'Order Confirmed',
        body: 'Your order has been confirmed.',
      }),
    },
  },
})
