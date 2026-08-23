import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * Turn a verified Stripe event into a change to this shop's orders.
 *
 * The addon's receiver has already checked the signature and answered Stripe;
 * this runs off the queue, where a slow database or a bad deploy costs a retry
 * rather than making Stripe believe the endpoint is down and start backing off.
 *
 * The order id travels in the payment intent's metadata, which is where the
 * checkout step puts it. Stripe knows nothing about our order ids otherwise.
 */
// @coverage-machine-surface Stripe feeds this through the addon's webhook queue; no person clicks it, and the scenario invokes it directly
export const applyStripeEvent = pikkuSessionlessFunc({
  // Exposed so a scenario can prove the mapping works. Reaching it through the
  // queue alone would mean signing a real Stripe event to test our own switch
  // statement — the signature is the addon's concern and has its own tests.
  expose: true,
  description:
    'Apply a verified Stripe webhook event to the order it refers to.',
  func: async (
    { kysely, logger },
    event: { type: string; data: { object: Record<string, any> } }
  ) => {
    const object = event.data?.object ?? {}
    const orderId = object.metadata?.orderId as string | undefined

    if (!orderId) {
      // Not every Stripe event is about one of our orders — customer and
      // subscription events arrive here too. Nothing to do is not a failure,
      // but it is worth being able to see.
      logger.info({ event: 'stripe_event_ignored', type: event.type })
      return { applied: false }
    }

    const status =
      event.type === 'payment_intent.succeeded'
        ? 'paid'
        : event.type === 'payment_intent.payment_failed'
          ? 'payment_failed'
          : event.type === 'charge.refunded'
            ? 'refunded'
            : null

    if (!status) {
      logger.info({ event: 'stripe_event_unmapped', type: event.type, orderId })
      return { applied: false }
    }

    const result = await kysely
      .updateTable('order')
      .set({ status, updatedAt: new Date().toISOString() })
      .where('orderId', '=', orderId)
      .executeTakeFirst()

    logger.info({
      event: 'stripe_event_applied',
      type: event.type,
      orderId,
      status,
    })
    return { applied: Number(result?.numUpdatedRows ?? 0) > 0 }
  },
})
