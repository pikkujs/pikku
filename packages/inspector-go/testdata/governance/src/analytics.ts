import { defineAnalyticsEvents } from '@pikku/core/analytics'
import { defineOutgoingWebhook } from '@pikku/core/webhook'
import { defineAnalyticsEvents as aliasDefine } from '@pikku/core/analytics'

declare const z: any
declare const page_viewed: any

export const events = defineAnalyticsEvents({
  signed_up: z
    .object({ plan: z.enum(['free', 'pro']), seats: z.number() })
    .strict(),
  'checkout started': z.object({}).describe('x'),
  page_viewed,
  custom: someSchema,
})

const hiddenEvents = defineAnalyticsEvents({ hidden: z.object({}) })
export const dupEvents = aliasDefine({ signed_up: z.object({}) })
export const empty = defineAnalyticsEvents({})
export const notObject = defineAnalyticsEvents(events)

export const orderPlaced = defineOutgoingWebhook({
  event: 'order.placed',
  title: 'Order placed',
  description: `When an order is placed`,
  payload: z.object({ id: z.string(), total: z.number() }),
})
export const orderShipped = defineOutgoingWebhook({
  event: 'order.shipped',
  title: 'Shipped',
  payload: shared,
})
export const dupWebhook = defineOutgoingWebhook({
  event: 'order.placed',
  title: 'Again',
})
export const missingTitle = defineOutgoingWebhook({ event: 'x' })
const privateHook = defineOutgoingWebhook({
  event: 'private',
  title: 'Private',
})
export const badHook = defineOutgoingWebhook(orderPlaced)

declare const someSchema: any
declare const shared: any
export { hiddenEvents as renamedEvents }
