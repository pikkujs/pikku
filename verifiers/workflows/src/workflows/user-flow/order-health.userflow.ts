/**
 * User flow: drives the order API the way users do. A user flow is a pure
 * story of remote RPCs — the func may only use logger/config from services
 * (inspector-enforced); actors arrive on the WIRE, supplied per run by the
 * runner (`pikku userflow run <environment>` or startWorkflow options).
 * Runtime friendly — no state reset, safe as a staged/production health check.
 */

import { pikkuUserFlow } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const orderHealthUserFlow = pikkuUserFlow<
  { orderId: string },
  { status: string; sameOrder: boolean }
>({
  title: 'Order health (user flow)',
  tags: ['user-flow', 'ecommerce'],
  func: async ({ logger }, data, { workflow, actors }) => {
    if (!actors?.customer || !actors?.ops) {
      throw new Error(
        'orderHealthUserFlow needs run actors (customer + ops) — pass them via startWorkflow options or `pikku userflow run`'
      )
    }
    logger.debug(`order-health flow starting for ${data.orderId}`)

    // The customer reads their order through their authenticated client
    const order = await workflow.do(
      'customer fetches the order',
      'orderGet',
      { orderId: data.orderId },
      { actor: actors.customer }
    )

    // A plain internal step still works when the runner provides an rpc
    // service (the `pikku userflow run` command refuses these on purpose)
    const internal = await workflow.do('internal re-read', 'orderGet', {
      orderId: data.orderId,
    })

    // Ops polls until the order reports a status (async-effect primitive)
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
