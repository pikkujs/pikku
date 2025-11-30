/**
 * Bulk Inventory Update Workflow
 * Demonstrates updating multiple inventory items
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Bulk inventory update workflow
 */
export const bulkInventoryUpdateWorkflow = pikkuWorkflowFunc<
  {
    updates: Array<{
      productId: string
      quantity: number
      operation: 'add' | 'subtract' | 'set'
    }>
  },
  {
    updatedCount: number
    results: Array<{ productId: string; newQuantity: number }>
  }
>(async (_services, data, { workflow }) => {
  const results: Array<{ productId: string; newQuantity: number }> = []

  // Process updates sequentially to maintain consistency
  for (const update of data.updates) {
    const result = await workflow.do(
      `Update ${update.productId}`,
      'inventoryUpdate',
      {
        productId: update.productId,
        quantity: update.quantity,
        operation: update.operation,
      }
    )
    results.push({
      productId: update.productId,
      newQuantity: result.newQuantity,
    })
  }

  // Notify completion
  await workflow.do('Notify bulk update complete', 'notifySlack', {
    channel: '#inventory',
    message: `Bulk inventory update completed: ${data.updates.length} products updated`,
  })

  return {
    updatedCount: data.updates.length,
    results,
  }
})
