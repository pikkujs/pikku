import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphBulkInventoryUpdateWorkflow = pikkuWorkflowGraph({
  name: 'graphBulkInventoryUpdateWorkflow',
  nodes: {
    update_update_productid: 'inventoryUpdate',
    notify_bulk_update_complete: 'notifySlack',
  },
  config: {
    notify_bulk_update_complete: {
      input: (ref, template) => ({
        channel: '#inventory',
        message: template(
          'Bulk inventory update completed: $0 products updated',
          [{ $ref: 'data.updates.length' } as any]
        ),
      }),
    },
  },
})
