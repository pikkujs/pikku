import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'
import type { WebhookReceiveResult, WebhookRequest } from '@pikku/core/trigger'

export const pingWebhookReceive = pikkuSessionlessFunc<
  WebhookRequest,
  WebhookReceiveResult
>({
  auth: false,
  description: 'Reads a ping delivery into a trigger event',
  func: async (_services, { body }) => {
    const data = JSON.parse(new TextDecoder().decode(body))
    return { events: [{ name: 'ping.sent', id: data.id, data: { n: data.n } }] }
  },
})
