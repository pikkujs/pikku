/**
 * Order Cancellation Workflow
 * Demonstrates order cancellation with refund and inventory release
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order cancellation workflow: get order, refund payment, release inventory
 */
export const orderCancellationWorkflow = pikkuWorkflowFunc<
  { orderId: string; reason: string },
  { refundId: string; inventoryReleased: boolean; status: string }
>(async (_services, data, { workflow }) => {
  // Step 1: Get order details
  const order = await workflow.do('Get order', 'orderGet', {
    orderId: data.orderId,
  })

  // Step 2: Process refund
  const refund = await workflow.do('Process refund', 'paymentRefund', {
    paymentId: `payment-${data.orderId}`,
    amount: order.total,
    reason: data.reason,
  })

  // Step 3: Release inventory reservations in parallel
  await Promise.all(
    order.items.map(
      async (item) =>
        await workflow.do(
          `Release inventory for ${item.productId}`,
          'inventoryRelease',
          {
            reservationId: `res-${data.orderId}-${item.productId}`,
          }
        )
    )
  )

  // Step 4: Update order status
  await workflow.do('Cancel order', 'orderCancel', {
    orderId: data.orderId,
    reason: data.reason,
  })

  // Step 5: Send cancellation notification
  await workflow.do('Send cancellation email', 'emailSend', {
    to: `customer-${order.customerId}@example.com`,
    subject: `Order ${data.orderId} Cancelled`,
    body: `Your order has been cancelled. Refund of $${order.total} is being processed.`,
  })

  return {
    refundId: refund.id,
    inventoryReleased: true,
    status: 'cancelled',
  }
})
