import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphComplexFilterChainWorkflow = pikkuWorkflowGraph({
  name: 'graphComplexFilterChainWorkflow',
  nodes: {
    flag_order_orderid: 'orderUpdate',
    send_filter_results: 'notifyEmail',
  },
  config: {
    flag_order_orderid: {
      input: (ref, template) => ({
        orderId: ref('$item', 'orderId'),
        status: 'flagged_for_review',
      }),
    },
    send_filter_results: {
      input: (ref, template) => ({
        userId: 'analyst',
        subject: 'Order Analysis Complete',
        body: template('Found $0 orders totaling $$1', [
          { $ref: 'matchingOrders.length' } as any,
          ref('trigger', 'totalValue'),
        ]),
      }),
    },
  },
})
