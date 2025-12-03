/**
 * Order with Inventory Check Workflow
 * Demonstrates order creation with inventory validation
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order with inventory check workflow
 *
 * Uses pikkuWorkflowComplexFunc because:
 * - Dynamic iteration over data.items array with Promise.all
 * - Filter callback to determine unavailable items
 * - Loop iteration count depends on runtime data
 */
export const orderWithInventoryCheckWorkflow = pikkuWorkflowComplexFunc<
  {
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
  },
  { orderId: string; allItemsAvailable: boolean; unavailableItems: string[] }
>({
  title: 'Order with Inventory Check',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    let orderId = ''
    let allItemsAvailable = false
    const unavailableItems: string[] = []

    // Step 1: Check inventory for all items in parallel
    const inventoryChecks = await Promise.all(
      data.items.map(
        async (item) =>
          await workflow.do(
            `Check inventory for ${item.productId}`,
            'inventoryCheck',
            {
              productId: item.productId,
            }
          )
      )
    )

    // Step 2: Determine unavailable items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      const check = inventoryChecks[i]
      if (check.available < item.quantity) {
        unavailableItems.push(item.productId)
      }
    }

    allItemsAvailable = unavailableItems.length === 0

    // Step 3: Create order only if all items available
    if (allItemsAvailable) {
      const order = await workflow.do('Create order', 'orderCreate', {
        customerId: data.customerId,
        items: data.items,
      })
      orderId = order.id

      // Reserve inventory for all items
      await Promise.all(
        data.items.map(
          async (item) =>
            await workflow.do(
              `Reserve inventory for ${item.productId}`,
              'inventoryReserve',
              {
                productId: item.productId,
                quantity: item.quantity,
                orderId: order.id,
              }
            )
        )
      )
    }

    return {
      orderId,
      allItemsAvailable,
      unavailableItems,
    }
  },
})
