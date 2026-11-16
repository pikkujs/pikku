import { z } from 'zod'
import { defineAnalyticsEvents } from '#pikku/analytics'
import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

export const analyticsEvents = defineAnalyticsEvents({
  checkout_completed: z.object({ amount: z.number() }),
  page_viewed: z.object({ path: z.string() }),
})

export const checkout = pikkuSessionlessFunc<{ amount: number }, { ok: true }>({
  func: async ({ analytics }, { amount }) => {
    await analytics!.record({ name: 'checkout_completed', amount })
    await analytics!.record({ name: 'page_viewed', path: '/done' })
    return { ok: true }
  },
})

wireHTTP({ route: '/checkout', method: 'post', auth: false, func: checkout })
