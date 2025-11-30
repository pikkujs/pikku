/**
 * Order with Inventory Check Workflow
 * Demonstrates order creation with inventory validation
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order with inventory check workflow
 */
export const orderWithInventoryCheckWorkflow = pikkuWorkflowFunc<
  {
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
  },
  { orderId: string; allItemsAvailable: boolean; unavailableItems: string[] }
>(async (_services, data, { workflow }) => {
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
  const unavailableItems = data.items
    .filter((item, index) => {
      const check = inventoryChecks[index]
      return check.available < item.quantity
    })
    .map((item) => item.productId)

  const allItemsAvailable = unavailableItems.length === 0

  // Step 3: Create order only if all items available
  let orderId = ''
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
})
