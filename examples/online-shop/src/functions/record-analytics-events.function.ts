import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { analyticsEvent } from '../analytics/registry.js'
import { forwardAnalyticsEvents } from '../__fabric_analytics__/fabric-analytics.js'

export const RecordAnalyticsEventsInput = z.object({
  events: z
    .array(
      z.object({
        /** When the event happened in the browser, epoch ms. Distrusted if far from server time. */
        at: z.number().int().optional(),
        event: analyticsEvent,
      })
    )
    .min(1)
    // A beacon batch is a handful of events; a large one is either a bug or an
    // attempt to amplify one request into arbitrary work.
    .max(50),
})

export const RecordAnalyticsEventsOutput = z.object({
  accepted: z.number(),
})

/**
 * Product-analytics ingest. Unauthenticated by necessity — anonymous visitors
 * are most of what this measures — so the wiring carries an origin lock that
 * rejects anything that is not a browser on this app's own origin. There is no
 * rate limit on it yet; see the wiring.
 *
 * **Identity is stamped here, from the session, and never read from the body.**
 * A signed-in request records the user; anything else records nothing at all —
 * no device storage, no visitor id, no consent banner. That is the whole
 * identity model, and it is why an unauthed endpoint is safe to expose: there
 * is no field a caller could set to attribute events to someone else.
 */
export const recordAnalyticsEvents = pikkuSessionlessFunc({
  auth: false,
  tags: ['analytics'],
  description: 'Records product-analytics events from the browser.',
  input: RecordAnalyticsEventsInput,
  output: RecordAnalyticsEventsOutput,
  func: async ({ variables, queueService }, { events }, { session }) => {
    await forwardAnalyticsEvents(
      { variables, queueService },
      events.map(({ at, event }) => {
        const { name, ...props } = event
        return { name, props, at }
      }),
      { userId: session?.userId ?? null }
    )

    return { accepted: events.length }
  },
})
