/**
 * Inventory Restock Workflow
 * Demonstrates low stock detection and reordering
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Inventory restock workflow: check low stock, create PO, notify
 */
export const inventoryRestockWorkflow = pikkuWorkflowFunc<
  { threshold: number; supplierId: string },
  { lowStockCount: number; purchaseOrderId: string; notified: boolean }
>({
  title: 'Inventory Restock',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Check for low stock items
    const lowStock = await workflow.do('Check low stock', 'inventoryCheckLow', {
      threshold: data.threshold,
    })

    // Step 2: If no low stock items, exit early
    if (lowStock.lowStockItems.length === 0) {
      return {
        lowStockCount: 0,
        purchaseOrderId: '',
        notified: false,
      }
    }

    // Step 3: Create purchase order for low stock items
    const purchaseOrder = await workflow.do(
      'Create purchase order',
      'purchaseOrderCreate',
      {
        supplierId: data.supplierId,
        items: lowStock.lowStockItems.map((item) => ({
          productId: item.productId,
          quantity: data.threshold * 2, // Order double the threshold
        })),
      }
    )

    // Step 4: Notify inventory team
    await workflow.do('Notify inventory team', 'notifySlack', {
      channel: '#inventory',
      message: `Purchase order ${purchaseOrder.id} created for ${lowStock.lowStockItems.length} low-stock items`,
    })

    // Step 5: Send email report
    await workflow.do('Send restock report', 'emailSend', {
      to: 'inventory@example.com',
      subject: 'Low Stock Alert - Purchase Order Created',
      body: `PO ${purchaseOrder.id} created for ${lowStock.lowStockItems.length} items.`,
    })

    return {
      lowStockCount: lowStock.lowStockItems.length,
      purchaseOrderId: purchaseOrder.id,
      notified: true,
    }
  },
})
