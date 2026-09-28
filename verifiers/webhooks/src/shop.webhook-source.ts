import { z } from 'zod'
import { UnauthorizedError } from '@pikku/core/errors'
import {
  wireTrigger,
  wireTriggerWebhookSource,
} from '#pikku/trigger/pikku-trigger-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readEndpoints, writeEndpoints } from './fake-provider.js'

export const firedOrders: Array<{ orderId: string; total: number }> = []
export const failNextOrders = new Set<string>()

wireTriggerWebhookSource({
  name: 'shop',
  secret: 'SHOP_WEBHOOK_SECRET',
  events: {
    'order.paid': z.object({ orderId: z.string(), total: z.number() }),
    'order.refunded': z.object({ orderId: z.string() }),
  },
  receive: {
    func: async ({ verifyShopSignature }, request) => {
      const body = JSON.parse(new TextDecoder().decode(request.body))
      if (body.type === 'url_verification') {
        return { respond: { status: 200, body: { challenge: body.challenge } } }
      }
      const signature = request.headers['x-shop-signature'] ?? ''
      if (!(await verifyShopSignature(request.body, signature))) {
        throw new UnauthorizedError('Bad signature')
      }
      return { events: [{ name: body.type, id: body.id, data: body.data }] }
    },
  },
  check: {
    func: async (_services, { url, label, events }) => {
      const endpoint = readEndpoints().find((e) => e.label === label)
      if (!endpoint) return { status: 'missing' }
      if (endpoint.url !== url || endpoint.events.join() !== events.join()) {
        return { status: 'drifted', reason: 'url or events changed' }
      }
      return { status: 'ok' }
    },
  },
  setup: {
    func: async (_services, { url, label, events }) => {
      const endpoints = readEndpoints()
      const existing = endpoints.find((e) => e.label === label)
      if (existing) {
        Object.assign(existing, { url, events })
        writeEndpoints(endpoints)
        return { status: 'updated', state: { id: existing.id } }
      }
      const endpoint = {
        id: `we_${endpoints.length + 1}`,
        url,
        label,
        events,
        secret: `whsec_${label}`,
      }
      writeEndpoints([...endpoints, endpoint])
      return {
        status: 'created',
        state: { id: endpoint.id },
        secret: endpoint.secret,
      }
    },
  },
  teardown: {
    func: async (_services, { label }) => {
      const endpoints = readEndpoints()
      const kept = endpoints.filter((e) => e.label !== label)
      writeEndpoints(kept)
      return { status: kept.length === endpoints.length ? 'absent' : 'deleted' }
    },
  },
})

wireTrigger({
  name: 'shop:order.paid',
  func: pikkuSessionlessFunc<{ orderId: string; total: number }, void>({
    func: async (_services, data) => {
      if (failNextOrders.delete(data.orderId)) {
        throw new Error(`transient failure for ${data.orderId}`)
      }
      firedOrders.push(data)
    },
  }),
})
