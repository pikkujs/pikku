import {
  pikkuWorkflowComplexFunc,
  pikkuWorkflowGraph,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

// @snippet start workflowComplexFunc
/**
 * The DSL cannot express "one step per order item", so this one is written in
 * TypeScript. `workflow.do` still records each call, so a resumed run replays
 * the loop without repeating the work it already did.
 */
export const refundOrderWorkflow = pikkuWorkflowComplexFunc<
  { orderId: string },
  { refunded: number }
>({
  title: 'Refund Order',
  tags: ['orders'],
  func: async (_services, { orderId }, { workflow }) => {
    const order = await workflow.do('Read the order', 'getOrder', { orderId })

    for (const item of order.items) {
      await workflow.do(`Restock ${item.itemId}`, 'onLowStock', {
        itemId: item.itemId,
        name: item.name,
        stock: item.quantity,
      })
    }

    await workflow.do('Cancel the order', 'cancelOrder', { orderId })

    return { refunded: order.items.length }
  },
})
// @snippet end workflowComplexFunc

// @snippet start workflowGraph
/**
 * The nightly housekeeping pass, declared as a graph rather than code: each
 * node names an RPC and says what feeds it, so the shape is data the console
 * can draw.
 */
export const nightlyHousekeeping = pikkuWorkflowGraph({
  description: 'Sweep abandoned baskets, then report the day',
  tags: ['reports'],
  nodes: {
    sweep: 'cleanupAbandonedBaskets',
    report: 'dailySalesReport',
  },
  config: {
    sweep: {
      next: 'report',
    },
    report: {},
  },
})
// @snippet end workflowGraph
