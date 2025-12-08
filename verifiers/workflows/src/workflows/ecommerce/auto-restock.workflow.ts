/**
 * Automatic Restock Workflow
 * Demonstrates automatic restocking with approval flow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Automatic restock with approval workflow
 */
export const autoRestockWorkflow = pikkuWorkflowFunc<
  { productId: string; minStock: number; restockQuantity: number },
  { restocked: boolean; newQuantity: number }
>({
  title: 'Auto Restock',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    const inventory = await workflow.do('Check inventory', 'inventoryCheck', {
      productId: data.productId,
    })

    // Step 2: Determine if restock needed
    if (inventory.available >= data.minStock) {
      return {
        restocked: false,
        newQuantity: inventory.available,
      }
    }

    // Step 3: Request approval via notification
    await workflow.do('Request restock approval', 'notifyEmail', {
      userId: 'inventory-manager',
      subject: `Restock Approval Needed: ${data.productId}`,
      body: `Current stock: ${inventory.available}. Requested: ${data.restockQuantity}`,
    })

    // Step 4: Wait for processing time (simulating approval)
    await workflow.sleep('Wait for approval processing', '2s')

    // Step 5: Perform restock
    const restock = await workflow.do('Restock inventory', 'inventoryRestock', {
      productId: data.productId,
      quantity: data.restockQuantity,
    })

    // Step 6: Confirm restock
    await workflow.do('Confirm restock', 'notifySlack', {
      channel: '#inventory',
      message: `Product ${data.productId} restocked. New quantity: ${restock.newAvailable}`,
    })

    return {
      restocked: true,
      newQuantity: restock.newAvailable,
    }
  },
})
