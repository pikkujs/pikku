export interface AnalyticsGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the product-analytics ingest.
 *
 * Only the wire and its schemas: the app declares what its events are, pikku
 * validates and identifies them, and `@pikku/core/analytics` hands them to
 * whatever sink is registered. Nothing here decides where they are stored.
 *
 * No middleware is emitted, deliberately. An origin lock is the obvious guard
 * for a browser-only app and rejects every native client, since a phone sends
 * no `Origin` at all — so which guard belongs in front of this route is the
 * project's call, added at the wiring like any other middleware. It would not
 * be a security boundary in either case: `Origin` is trusted from browsers and
 * forgeable by everyone else, and volume is a rate limit's job at the edge.
 *
 * @param analyticsImport specifier for the module holding the app's `pikkuAnalytics` declaration, e.g. `../../analytics.js`
 * @param analyticsVariable the name that declaration is exported under
 */
export const serializeAnalytics = (
  leaf: (name: string) => string,
  analyticsImport: string,
  analyticsVariable: string,
  globalHTTPPrefix: string = ''
): AnalyticsGenOutput => {
  const schemas = `/**
 * Auto-generated analytics ingest schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'
import { ${analyticsVariable} } from '${analyticsImport}'

/**
 * A batch of events from one beacon.
 *
 * Batched because a browser sends these on unload, where one request survives
 * and several may not. Capped at 50 so a single unauthenticated request cannot
 * ask for unbounded work; \`at\` is the client's own clock and a sink decides
 * how far to trust it.
 */
export const AnalyticsIngest = z.object({
  events: z
    .array(
      z.object({
        at: z.number().int().optional(),
        event: ${analyticsVariable}.events,
      })
    )
    .min(1)
    .max(50),
})

export const AnalyticsIngestOutput = z.object({
  accepted: z.number(),
})
`

  const functions = `/**
 * Auto-generated analytics ingest
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import {
  flattenAnalyticsEvent,
  recordAnalyticsEvents,
} from '@pikku/core/analytics'
import {
  AnalyticsIngest,
  AnalyticsIngestOutput,
} from './analytics.schemas.gen.js'

/**
 * Unauthenticated by necessity: anonymous visitors are most of what this
 * measures.
 *
 * Identity is stamped here from the session and never read from the body, so
 * there is no field a caller could set to attribute events to someone else.
 * A signed-in request records the user; anything else records nothing — no
 * device storage, no visitor id, no consent banner.
 */
export const analyticsIngest = pikkuSessionlessFunc({
  auth: false,
  tags: ['analytics'],
  description: 'Records product-analytics events from a client.',
  input: AnalyticsIngest,
  output: AnalyticsIngestOutput,
  func: async (services, { events }, { session }) => {
    const accepted = await recordAnalyticsEvents(
      services,
      events.map(({ at, event }) => flattenAnalyticsEvent(event, at)),
      { userId: session?.userId ?? null }
    )
    return { accepted }
  },
})

wireHTTP({
  route: '${globalHTTPPrefix}/analytics',
  method: 'post',
  auth: false,
  tags: ['analytics'],
  func: analyticsIngest,
})
`

  return { schemas, functions }
}
