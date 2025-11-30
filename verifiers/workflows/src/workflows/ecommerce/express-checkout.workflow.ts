/**
 * Express Checkout Workflow
 * Demonstrates single-item express checkout
 */

import {
  pikkuWorkflowFunc,
  WorkflowCancelledException,
} from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Express checkout workflow (single step)
 */
export const expressCheckoutWorkflow = pikkuWorkflowFunc<
  {
    customerId: string
    productId: string
    quantity: number
    paymentMethodId: string
  },
  { orderId: string; success: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Check inventory
  const inventory = await workflow.do('Check inventory', 'inventoryCheck', {
    productId: data.productId,
  })

  if (inventory.available < data.quantity) {
    throw new WorkflowCancelledException('Insufficient inventory')
  }

  // Step 2: Create single-item order
  const order = await workflow.do('Create order', 'orderCreate', {
    customerId: data.customerId,
    items: [
      { productId: data.productId, quantity: data.quantity, price: 29.99 },
    ],
  })

  // Step 3: Process payment immediately
  const payment = await workflow.do(
    'Process payment',
    'paymentProcess',
    {
      orderId: order.id,
      amount: order.total,
      currency: 'USD',
      paymentMethodId: data.paymentMethodId,
    },
    { retries: 2, retryDelay: '1s' }
  )

  // Step 4: Reserve inventory and send confirmation in parallel
  await Promise.all([
    workflow.do('Reserve inventory', 'inventoryReserve', {
      productId: data.productId,
      quantity: data.quantity,
      orderId: order.id,
    }),
    workflow.do('Send confirmation', 'emailSend', {
      to: `customer-${data.customerId}@example.com`,
      subject: 'Express Order Confirmed',
      body: `Order ${order.id} confirmed!`,
    }),
  ])

  return {
    orderId: order.id,
    success: payment.status === 'completed',
  }
})
