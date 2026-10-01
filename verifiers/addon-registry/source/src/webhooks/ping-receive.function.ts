import { pikkuWebhookReceive } from '../../.pikku/addon/trigger/index.js'
import { parseJson } from '../../.pikku/addon/utils/index.js'

export const pingWebhookReceive = pikkuWebhookReceive({
  description: 'Reads a ping delivery into a trigger event',
  func: async (_services, { body }) => {
    const data = parseJson(body)
    return { events: [{ name: 'ping.sent', id: data.id, data: { n: data.n } }] }
  },
})
