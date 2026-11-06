// @snippet start completeFunction
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { NotFoundError } from '#pikku/error'
import { hasProfileRole, isOrderOwner } from '../../wirings/shop.security.js'

export const RequestRefundInput = z.object({
  orderId: z.string(),
  reason: z.string(),
})
export const RequestRefundOutput = z.object({ runId: z.string() })

// The export name is the RPC name. `expose: true` is all a client needs: the
// generated clients call `requestRefund` with no wireHTTP.
export const requestRefund = pikkuFunc({
  expose: true,
  description: 'Ask for a refund on an order.',
  input: RequestRefundInput,
  output: RequestRefundOutput,
  // A map of guards, each from `pikkuPermission`. Any one key passing admits.
  permissions: {
    owner: isOrderOwner,
    support: hasProfileRole({ role: 'support' }),
  },
  // Services, then input, then the wire: `session`, `rpc`, `http`, `channel`.
  func: async ({ kysely, logger }, { orderId, reason }, { session, rpc }) => {
    const order = await kysely
      .selectFrom('order')
      .select('orderId')
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    if (!order) throw new NotFoundError()

    logger.info(`${session.userId} asked to refund ${orderId}`)
    return rpc.startWorkflow('refundWorkflow', { orderId, reason })
  },
})
// @snippet end completeFunction
