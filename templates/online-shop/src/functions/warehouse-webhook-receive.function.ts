import { pikkuWebhookReceive } from '#pikku/trigger'
import { parseJson } from '#pikku/utils'

// @snippet start pikkuWebhookReceive
/**
 * Reads a warehouse delivery into trigger events. The source's `verify` has
 * already checked the signature by the time this runs, so all that is left is
 * the shape: `parseJson` answers a body that is not JSON with a 400, and each
 * event's `id` lets a redelivery be recognised rather than run twice.
 */
export const warehouseWebhookReceive = pikkuWebhookReceive({
  description: 'Read a warehouse webhook into trigger events',
  func: async (_services, { body }) => {
    const event = parseJson(body)
    return { events: [{ name: event.type, id: event.id, data: event.data }] }
  },
})
// @snippet end pikkuWebhookReceive
