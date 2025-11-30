/**
 * Cart Checkout Workflow
 * Demonstrates cart to order conversion with payment
 */

import {
  pikkuWorkflowFunc,
  WorkflowCancelledException,
} from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Cart checkout workflow: get cart, create order, process payment
 */
export const cartCheckoutWorkflow = pikkuWorkflowFunc<
  { customerId: string; shippingAddress: string; paymentMethodId: string },
  { orderId: string; paymentStatus: string; total: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Get cart contents
  const cart = await workflow.do('Get cart', 'cartGet', {
    customerId: data.customerId,
  })

  // Step 2: Validate cart has items
  if (cart.items.length === 0) {
    throw new WorkflowCancelledException('Cart is empty')
  }

  // Step 3: Check inventory for all items
  const inventoryChecks = await Promise.all(
    cart.items.map(
      async (item) =>
        await workflow.do(`Check ${item.productId}`, 'inventoryCheck', {
          productId: item.productId,
        })
    )
  )

  // Verify all items in stock
  const outOfStock = cart.items.filter((item, i) => !inventoryChecks[i].inStock)
  if (outOfStock.length > 0) {
    throw new WorkflowCancelledException(
      `Items out of stock: ${outOfStock.map((i) => i.productId).join(', ')}`
    )
  }

  // Step 4: Create order from cart
  const checkout = await workflow.do('Checkout cart', 'cartCheckout', {
    customerId: data.customerId,
    shippingAddress: data.shippingAddress,
    paymentMethodId: data.paymentMethodId,
  })

  // Step 5: Authorize payment first
  const authorization = await workflow.do(
    'Authorize payment',
    'paymentAuthorize',
    {
      orderId: checkout.orderId,
      amount: checkout.total,
      currency: 'USD',
      paymentMethodId: data.paymentMethodId,
    }
  )

  // Step 6: Reserve inventory
  await Promise.all(
    cart.items.map(
      async (item) =>
        await workflow.do(`Reserve ${item.productId}`, 'inventoryReserve', {
          productId: item.productId,
          quantity: item.quantity,
          orderId: checkout.orderId,
        })
    )
  )

  // Step 7: Capture payment
  const capture = await workflow.do('Capture payment', 'paymentCapture', {
    paymentId: authorization.id,
    amount: checkout.total,
  })

  // Step 8: Update order status
  await workflow.do('Update order to paid', 'orderUpdate', {
    orderId: checkout.orderId,
    status: 'paid',
  })

  // Step 9: Send confirmation
  await workflow.do('Send order confirmation', 'emailSend', {
    to: `customer-${data.customerId}@example.com`,
    subject: 'Order Confirmed!',
    body: `Your order ${checkout.orderId} for $${checkout.total} has been placed.`,
  })

  return {
    orderId: checkout.orderId,
    paymentStatus: capture.status,
    total: checkout.total,
  }
})
