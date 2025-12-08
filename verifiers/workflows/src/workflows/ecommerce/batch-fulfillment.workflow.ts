/**
 * Batch Fulfillment Workflow
 * Demonstrates fulfilling multiple orders in sequence
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Batch fulfillment workflow
 */
export const batchFulfillmentWorkflow = pikkuWorkflowComplexFunc<
  { orderIds: string[]; carrier: string },
  { fulfilledOrders: string[]; failedOrders: string[] }
>({
  title: 'Batch Fulfillment',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    const fulfilledOrders: string[] = []
    const failedOrders: string[] = []

    for (const orderId of data.orderIds) {
      // Get order
      const order = await workflow.do(`Get order ${orderId}`, 'orderGet', {
        orderId,
      })

      // Check if order can be fulfilled
      let canFulfill = true
      for (const item of order.items) {
        const check = await workflow.do(
          `Check inventory for ${item.productId} (order ${orderId})`,
          'inventoryCheck',
          { productId: item.productId }
        )
        if (check.available < item.quantity) {
          canFulfill = false
          break
        }
      }

      if (canFulfill) {
        // Create shipment
        await workflow.do(`Create shipment for ${orderId}`, 'shipmentCreate', {
          orderId,
          carrier: data.carrier,
        })
        await workflow.do(`Update order ${orderId} to shipped`, 'orderUpdate', {
          orderId,
          status: 'shipped',
        })
        fulfilledOrders.push(orderId)
      } else {
        failedOrders.push(orderId)
      }

      // Small delay between orders
      await workflow.sleep(`Delay after order ${orderId}`, '50ms')
    }

    return { fulfilledOrders, failedOrders }
  },
})
