/**
 * Multiple retryable steps workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const multipleRetryableStepsWorkflow = pikkuWorkflowFunc<
  { orderId: string; paymentMethodId: string },
  {
    paymentProcessed: boolean
    inventoryReserved: boolean
    notificationSent: boolean
  }
>(async (_services, data, { workflow }) => {
  // Step 1: Process payment with retries
  const payment = await workflow.do(
    'Process payment',
    'paymentProcess',
    {
      orderId: data.orderId,
      amount: 100,
      currency: 'USD',
      paymentMethodId: data.paymentMethodId,
    },
    { retries: 3, retryDelay: '2s' }
  )

  // Step 2: Reserve inventory with retries
  await workflow.do(
    'Reserve inventory',
    'inventoryReserve',
    {
      productId: 'prod-1',
      quantity: 1,
      orderId: data.orderId,
    },
    { retries: 2, retryDelay: '1s' }
  )

  // Step 3: Send notification with retries
  await workflow.do(
    'Send confirmation',
    'notifyEmail',
    {
      userId: 'customer-1',
      subject: 'Order Confirmed',
      body: 'Your order has been confirmed.',
    },
    { retries: 2, retryDelay: '500ms' }
  )

  return {
    paymentProcessed: payment.status === 'completed',
    inventoryReserved: true,
    notificationSent: true,
  }
})
