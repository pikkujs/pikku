import { pikkuVoidFunc } from '#pikku/function'

/**
 * One pass over the flows that need attention, firing the handler for each.
 *
 * This was a `setInterval` inside a trigger source. That reimplemented the
 * scheduler badly: it could not be invoked once, so nothing could test it, an
 * operator had no way to force it, and calling it would have leaked a timer.
 * The loop belonged to `wireScheduler` all along.
 */
export const sweepPendingWebhooks = pikkuVoidFunc({
  // Exposed so an operator can force a pass and a scenario can prove it works.
  expose: true,
  func: async ({ kysely, logger }, _data, { rpc }) => {
    const rows = await kysely
      .selectFrom('flow')
      .select(['flowId'])
      .where('status', '=', 'active')
      .where('triggerKind', '=', 'webhook')
      .execute()

    for (const row of rows) {
      await rpc.invoke('onWebhookReceived', { flowId: row.flowId, body: {} })
    }

    logger.info({ event: 'pending_webhooks_swept', noticed: rows.length })
  },
})
