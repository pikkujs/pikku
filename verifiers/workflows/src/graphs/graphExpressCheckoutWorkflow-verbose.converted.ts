import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphExpressCheckoutWorkflow = pikkuWorkflowGraph({
  name: 'graphExpressCheckoutWorkflow',
  tags: ['ecommerce'],
  nodes: {
    check_inventory: 'inventoryCheck',
    create_order: 'orderCreate',
    process_payment: 'paymentProcess',
    reserve_inventory: 'inventoryReserve',
    send_confirmation: 'emailSend',
  },
  config: {
    check_inventory: {
      next: 'create_order',
      input: (ref, template) => ({
        productId: ref('trigger', 'productId'),
      }),
    },
    create_order: {
      next: 'process_payment',
      input: (ref, template) => ({
        customerId: ref('trigger', 'customerId'),
        items: [
          {
            productId: ref('trigger', 'productId'),
            quantity: ref('trigger', 'quantity'),
            price: 29.99,
          },
        ],
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
    reserve_inventory: {
      next: 'send_confirmation',
      input: (ref, template) => ({
        productId: ref('trigger', 'productId'),
        quantity: ref('trigger', 'quantity'),
        orderId: ref('create_order', 'id'),
      }),
    },
    send_confirmation: {
      input: (ref, template) => ({
        to: template('customer-$0@example.com', [ref('trigger', 'customerId')]),
        subject: 'Express Order Confirmed',
        body: template('Order $0 confirmed!', [ref('create_order', 'id')]),
      }),
    },
  },
})
