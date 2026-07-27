/**
 * Partial Order Cancellation Workflow
 * Demonstrates cancelling specific items from an order
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Partial order cancellation workflow
 */
export const partialCancellationWorkflow = pikkuWorkflowFunc<
  { orderId: string; itemsToCancel: string[]; reason: string },
  { refundAmount: number; itemsCancelled: string[] }
>({
  title: 'Partial Cancellation',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get order details
    const order = await workflow.do('Get order', 'orderGet', {
      orderId: data.orderId,
    })

    // Step 2: Calculate refund amount for cancelled items. The "is this one
    // being cancelled?" test is a filter rather than an `if` inside the loop —
    // a DSL fanout body is a flat list of steps with no branch member, so
    // `.filter` is how the DSL expresses a per-item condition.
    const cancelledItems = order.items.filter((item) =>
      data.itemsToCancel.includes(item.productId)
    )
    const itemsCancelled: string[] = []
    let refundAmount = 0
    for (const item of cancelledItems) {
      refundAmount += item.price * item.quantity
      itemsCancelled.push(item.productId)

      // Release inventory
      await workflow.do(`Release ${item.productId}`, 'inventoryRelease', {
        reservationId: `res-${data.orderId}-${item.productId}`,
      })

      // Remove item from order
      await workflow.do(
        `Remove ${item.productId} from order`,
        'orderItemRemove',
        {
          orderId: data.orderId,
          productId: item.productId,
        }
      )
    }

    // Step 3: Process partial refund
    if (refundAmount > 0) {
      await workflow.do('Process partial refund', 'paymentRefund', {
        paymentId: `payment-${data.orderId}`,
        amount: refundAmount,
        reason: data.reason,
      })
    }

    // Step 4: Send notification
    await workflow.do('Send partial cancellation email', 'emailSend', {
      to: `customer-${order.customerId}@example.com`,
      subject: `Partial Order Update - ${data.orderId}`,
      body: `${itemsCancelled.length} item(s) cancelled. Refund: $${refundAmount}`,
    })

    return {
      refundAmount,
      itemsCancelled,
    }
  },
})
