import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphInventoryRestockWorkflow = pikkuWorkflowGraph({
  name: 'graphInventoryRestockWorkflow',
  tags: ['ecommerce'],
  nodes: {
    check_low_stock: 'inventoryCheckLow',
    create_purchase_order: 'purchaseOrderCreate',
    notify_inventory_team: 'notifySlack',
    send_restock_report: 'emailSend',
  },
  config: {
    check_low_stock: {
      next: 'create_purchase_order',
      input: (ref, template) => ({
        threshold: ref('trigger', 'threshold'),
      }),
    },
    create_purchase_order: {
      next: 'notify_inventory_team',
      input: (ref, template) => ({
        supplierId: ref('trigger', 'supplierId'),
      }),
    },
    notify_inventory_team: {
      next: 'send_restock_report',
      input: (ref, template) => ({
        channel: '#inventory',
        message: template('Purchase order $0 created for $1 low-stock items', [
          ref('create_purchase_order', 'id'),
          { $ref: 'lowStock.lowStockItems.length' } as any,
        ]),
      }),
    },
    send_restock_report: {
      input: (ref, template) => ({
        to: 'inventory@example.com',
        subject: 'Low Stock Alert - Purchase Order Created',
        body: template('PO $0 created for $1 items.', [
          ref('create_purchase_order', 'id'),
          { $ref: 'lowStock.lowStockItems.length' } as any,
        ]),
      }),
    },
  },
})
