import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphSagaWithCompensationLogicWorkflow = pikkuWorkflowGraph({
  name: 'graphSagaWithCompensationLogicWorkflow',
  tags: ['patterns'],
  nodes: {
    reserve_inventory: 'inventoryReserve',
    process_payment: 'paymentProcess',
    compensate_release_inventory: 'inventoryRelease',
    compensate_refund_payment: 'paymentRefund',
    cancel_order: 'orderCancel',
    update_order_to_completed: 'orderUpdate',
  },
  config: {
    reserve_inventory: {
      next: 'process_payment',
      input: (ref, template) => ({
        productId: 'prod-1',
        quantity: 1,
        orderId: ref('trigger', 'orderId'),
      }),
    },
    process_payment: {
      next: 'update_order_to_completed',
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
        amount: 100,
        currency: 'USD',
        paymentMethodId: 'pm-1',
      }),
    },
    compensate_release_inventory: {
      next: 'compensate_refund_payment',
      input: (ref, template) => ({
        reservationId: ref('reserve_inventory', 'reservationId'),
      }),
    },
    compensate_refund_payment: {
      next: 'cancel_order',
      input: (ref, template) => ({
        paymentId: ref('process_payment', 'id'),
        reason: 'Order processing failed',
      }),
    },
    cancel_order: {
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
        reason: 'Processing failed - compensated',
      }),
    },
    update_order_to_completed: {
      input: (ref, template) => ({
        orderId: ref('trigger', 'orderId'),
        status: 'completed',
      }),
    },
  },
})
