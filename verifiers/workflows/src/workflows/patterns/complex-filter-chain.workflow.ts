/**
 * Complex filter chain workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexFilterChainWorkflow = pikkuWorkflowFunc<
  {
    orders: Array<{
      id: string
      total: number
      status: string
      customerId: string
      createdAt: string
    }>
    minTotal: number
    targetStatus: string
  },
  { matchingOrders: string[]; totalValue: number }
>({
  title: 'Complex Filter Chain',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Chain multiple filters
    const matchingOrders = data.orders
      .filter((order) => order.status === data.targetStatus)
      .filter((order) => order.total >= data.minTotal)
      .map((order) => order.id)

    // Calculate total value
    const totalValue = data.orders
      .filter((order) => matchingOrders.includes(order.id))
      .reduce((sum, order) => sum + order.total, 0)

    // Process matching orders
    for (const orderId of matchingOrders) {
      await workflow.do(`Flag order ${orderId}`, 'orderUpdate', {
        orderId,
        status: 'flagged_for_review',
      })
    }

    // Notify about results
    await workflow.do('Send filter results', 'notifyEmail', {
      userId: 'analyst',
      subject: 'Order Analysis Complete',
      body: `Found ${matchingOrders.length} orders totaling $${totalValue}`,
    })

    return { matchingOrders, totalValue }
  },
})
