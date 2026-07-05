import { pikkuScenario } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const orderHealthScenario = pikkuScenario<
  { orderId: string },
  { status: string; sameOrder: boolean }
>({
  title: 'Order health (scenario)',
  tags: ['scenario', 'ecommerce'],
  func: async ({ logger }, data, { workflow, actors }) => {
    if (!actors?.customer || !actors?.ops) {
      throw new Error(
        'orderHealthScenario needs run actors (customer + ops) — pass them via startWorkflow options or `pikku scenario run`'
      )
    }
    logger.debug(`order-health flow starting for ${data.orderId}`)

    const order = await workflow.do(
      'customer fetches the order',
      'orderGet',
      { orderId: data.orderId },
      { actor: actors.customer }
    )

    const internal = await workflow.do('internal re-read', 'orderGet', {
      orderId: data.orderId,
    })

    const settled = await workflow.expectEventually(
      'ops sees the order settle',
      'orderGet',
      { orderId: data.orderId },
      (out: { status: string }) =>
        typeof out.status === 'string' && out.status.length > 0,
      { actor: actors.ops, within: '5s', interval: 25 }
    )

    return { status: settled.status, sameOrder: order.id === internal.id }
  },
})
