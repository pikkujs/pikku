import { pikkuScenario } from '#pikku/scenario'

export const orderHealthScenario = pikkuScenario<
  { orderId: string },
  { status: string; sameOrder: boolean }
>({
  title: 'Order health (scenario)',
  tags: ['scenario', 'ecommerce'],
  func: async ({ logger }, data, { scenario, virtualUsers }) => {
    if (!virtualUsers?.customer || !virtualUsers?.ops) {
      throw new Error(
        'orderHealthScenario needs run virtual users (customer + ops) — pass them via startWorkflow options or `pikku scenario run`'
      )
    }
    logger.debug(`order-health flow starting for ${data.orderId}`)

    const order = await scenario.do(
      'customer fetches the order',
      'orderGet',
      { orderId: data.orderId },
      { virtualUser: virtualUsers.customer }
    )

    const internal = await scenario.do('internal re-read', 'orderGet', {
      orderId: data.orderId,
    })

    const settled = await scenario.expectEventually(
      'ops sees the order settle',
      'orderGet',
      { orderId: data.orderId },
      (out: { status: string }) =>
        typeof out.status === 'string' && out.status.length > 0,
      { virtualUser: virtualUsers.ops, within: '5s', interval: 25 }
    )

    return { status: settled.status, sameOrder: order.id === internal.id }
  },
})
