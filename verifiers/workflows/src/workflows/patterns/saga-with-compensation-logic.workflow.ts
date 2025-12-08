/**
 * Saga with explicit compensation logic workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const sagaWithCompensationLogicWorkflow = pikkuWorkflowFunc<
  { orderId: string; shouldFail: boolean },
  { finalState: string }
>({
  title: 'Saga With Compensation Logic',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Reserve inventory
    const reservation = await workflow.do(
      'Reserve inventory',
      'inventoryReserve',
      {
        productId: 'prod-1',
        quantity: 1,
        orderId: data.orderId,
      }
    )

    // Step 2: Process payment
    const payment = await workflow.do('Process payment', 'paymentProcess', {
      orderId: data.orderId,
      amount: 100,
      currency: 'USD',
      paymentMethodId: 'pm-1',
    })

    // Step 3: Simulate potential failure point
    if (data.shouldFail) {
      // Compensate: Release inventory
      await workflow.do('Compensate: Release inventory', 'inventoryRelease', {
        reservationId: reservation.reservationId,
      })

      // Compensate: Refund payment
      await workflow.do('Compensate: Refund payment', 'paymentRefund', {
        paymentId: payment.id,
        reason: 'Order processing failed',
      })

      // Cancel order
      await workflow.do('Cancel order', 'orderCancel', {
        orderId: data.orderId,
        reason: 'Processing failed - compensated',
      })

      return { finalState: 'compensated' }
    }

    // Step 4: Complete order
    await workflow.do('Update order to completed', 'orderUpdate', {
      orderId: data.orderId,
      status: 'completed',
    })

    return { finalState: 'completed' }
  },
})
