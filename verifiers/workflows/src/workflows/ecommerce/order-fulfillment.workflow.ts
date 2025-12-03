/**
 * Order Fulfillment Workflow
 * Demonstrates order fulfillment with shipping
 */

import {
  pikkuWorkflowComplexFunc,
  WorkflowCancelledException,
} from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order fulfillment workflow: get order, check inventory, create shipment
 */
export const orderFulfillmentWorkflow = pikkuWorkflowComplexFunc<
  { orderId: string; carrier: string },
  { shipmentId: string; trackingNumber: string; status: string }
>(async (_services, data, { workflow }) => {
  // Step 1: Get order details
  const order = await workflow.do('Get order', 'orderGet', {
    orderId: data.orderId,
  })

  // Step 2: Check and reserve inventory for all items
  for (const item of order.items) {
    const inventoryCheck = await workflow.do(
      `Check inventory for ${item.productId}`,
      'inventoryCheck',
      { productId: item.productId }
    )

    if (!inventoryCheck.inStock) {
      throw new WorkflowCancelledException(
        `Item ${item.productId} is out of stock`
      )
    }

    await workflow.do(`Reserve ${item.productId}`, 'inventoryReserve', {
      productId: item.productId,
      quantity: item.quantity,
      orderId: data.orderId,
    })
  }

  // Step 3: Update order status to processing
  await workflow.do('Update order to processing', 'orderUpdate', {
    orderId: data.orderId,
    status: 'processing',
  })

  // Step 4: Create shipment
  const shipment = await workflow.do('Create shipment', 'shipmentCreate', {
    orderId: data.orderId,
    carrier: data.carrier,
  })

  // Step 5: Update order status to shipped
  await workflow.do('Update order to shipped', 'orderUpdate', {
    orderId: data.orderId,
    status: 'shipped',
  })

  // Step 6: Send shipping notification
  await workflow.do('Send shipping notification', 'emailSend', {
    to: `customer-${order.customerId}@example.com`,
    subject: `Your order ${data.orderId} has shipped!`,
    body: `Tracking number: ${shipment.trackingNumber}`,
  })

  return {
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: 'shipped',
  }
})
