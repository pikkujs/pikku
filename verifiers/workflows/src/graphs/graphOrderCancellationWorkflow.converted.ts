import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphOrderCancellationWorkflow = pikkuWorkflowGraph({
  name: 'graphOrderCancellationWorkflow',
  nodes: {
    get_order: 'orderGet',
    process_refund: 'paymentRefund',
    release_inventory_for_item_productid: 'inventoryRelease',
    cancel_order: 'orderCancel',
    send_cancellation_email: 'emailSend',
  },
  config: {
    get_order: {
      next: 'process_refund',
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
      }),
    },
    process_refund: {
      next: 'release_inventory_for_item_productid',
      input: (ref, template) => ({
        paymentId: template('payment-$0', [ref('trigger', 'orderId')]),
        amount: ref('get_order', 'total'),
        reason: ref('trigger', 'reason'),
      }),
    },
    release_inventory_for_item_productid: {
      input: (ref, template) => ({
        reservationId: template('res-$0-$1', [
          ref('trigger', 'orderId'),
          { $ref: 'item.productId' } as any,
        ]),
      }),
    },
    cancel_order: {
      next: 'send_cancellation_email',
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
        reason: ref('trigger', 'reason'),
      }),
    },
    send_cancellation_email: {
      input: (ref, template) => ({
        to: template('customer-$0@example.com', [
          ref('get_order', 'customerId'),
        ]),
        subject: template('Order $0 Cancelled', [ref('trigger', 'orderId')]),
        body: template(
          'Your order has been cancelled. Refund of $$0 is being processed.',
          [ref('get_order', 'total')]
        ),
      }),
    },
  },
})
