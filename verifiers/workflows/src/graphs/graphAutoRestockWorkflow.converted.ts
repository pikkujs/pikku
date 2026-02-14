import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphAutoRestockWorkflow = pikkuWorkflowGraph({
  name: 'graphAutoRestockWorkflow',
  nodes: {
    check_inventory: 'inventoryCheck',
    request_restock_approval: 'notifyEmail',
    restock_inventory: 'inventoryRestock',
    confirm_restock: 'notifySlack',
  },
  config: {
    check_inventory: {
      next: 'request_restock_approval',
      input: (ref, template) => ({
        productId: ref('trigger', 'productId'),
      }),
    },
    request_restock_approval: {
      next: 'restock_inventory',
      input: (ref, template) => ({
        userId: 'inventory-manager',
        subject: template('Restock Approval Needed: $0', [
          ref('trigger', 'productId'),
        ]),
        body: template('Current stock: $0. Requested: $1', [
          ref('check_inventory', 'available'),
          ref('trigger', 'restockQuantity'),
        ]),
      }),
    },
    restock_inventory: {
      next: 'confirm_restock',
      input: (ref, template) => ({
        productId: ref('trigger', 'productId'),
        quantity: ref('trigger', 'restockQuantity'),
      }),
    },
    confirm_restock: {
      input: (ref, template) => ({
        channel: '#inventory',
        message: template('Product $0 restocked. New quantity: $1', [
          ref('trigger', 'productId'),
          ref('restock_inventory', 'newAvailable'),
        ]),
      }),
    },
  },
})
