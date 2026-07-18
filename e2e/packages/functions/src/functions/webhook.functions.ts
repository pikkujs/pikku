import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * Enqueues an outgoing webhook to a caller-provided URL. The e2e test points
 * this at {@link webhookSink} so the in-memory queue worker delivers it and the
 * KyselyWebhookService records the attempt for the console webhooks page.
 */
export const triggerWebhook = pikkuSessionlessFunc<
  { url: string; event?: string },
  { jobId: string }
>({
  expose: true,
  func: async ({ webhookService }, { url, event }) => {
    if (!webhookService) {
      throw new Error('webhookService is not configured')
    }
    return webhookService.send({
      url,
      event: event ?? 'e2e.webhook',
      data: { hello: 'world' },
    })
  },
})

/**
 * Delivery target for the roundtrip test — always 200s. Accepts the signed
 * webhook payload as its body (it doesn't inspect it) so pikku doesn't reject
 * the POST for a body it wasn't expecting.
 */
export const webhookSink = pikkuSessionlessFunc<
  { hello?: string },
  { ok: boolean }
>({
  expose: true,
  func: async () => ({ ok: true }),
})
