import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const WebhookPayload = z.object({
  flowId: z.string(),
  body: z.record(z.string(), z.unknown()),
})

export const onWebhookReceived = pikkuSessionlessFunc({
  expose: false,
  description: 'Fires when an inbound webhook matches a flow’s trigger.',
  input: WebhookPayload,
  func: async ({ logger }, { flowId }) => {
    logger.info({ event: 'webhook_trigger', flowId })
  },
})
