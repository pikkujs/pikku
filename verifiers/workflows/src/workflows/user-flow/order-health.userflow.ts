/**
 * User flow: drives the order API the way users do. Actor steps go over the
 * REAL transport via the injected `actors` registry; internal steps still
 * dispatch in-process. Runtime friendly — no state reset, safe as a staged /
 * production health check.
 */

import { pikkuUserFlow } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const orderHealthUserFlow = pikkuUserFlow<
  { orderId: string },
  { status: string; sameOrder: boolean }
>({
  title: 'Order health (user flow)',
  tags: ['user-flow', 'ecommerce'],
  func: async ({ actors }, data, { workflow }) => {
    if (!actors?.customer || !actors?.ops) {
      throw new Error(
        'orderHealthUserFlow needs an injected actors registry with customer + ops'
      )
    }

    // The customer reads their order through their authenticated client
    const order = await workflow.do(
      'customer fetches the order',
      'orderGet',
      { orderId: data.orderId },
      { actor: actors.customer }
    )

    // A plain internal step still works inside the same flow
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
