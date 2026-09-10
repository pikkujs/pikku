export interface AnalyticsGenOutput {
  schemas: string
  functions: string
}

/** One `defineAnalyticsEvents` declaration, as the generator needs it. */
export interface AnalyticsDeclaration {
  /** ESM specifier from the generated schemas file to the declaration. */
  specifier: string
  /** The name the declaration is exported under. */
  variable: string
  /** The event names it declares. */
  events: string[]
}

/**
 * Local alias for a declaration's import, so two modules can both export
 * `analyticsEvents` without colliding in the generated file.
 */
const alias = (index: number) => `events${index}`

/**
 * Generate the product-analytics ingest.
 *
 * Only the wire and its schemas: the app declares what its events are, pikku
 * validates and identifies them, and `services.analyticsLog` hands them to
 * whatever `AnalyticsService` is wired. Nothing here decides where they are
 * stored.
 *
 * No middleware is emitted, deliberately. An origin lock is the obvious guard
 * for a browser-only app and rejects every native client, since a phone sends
 * no `Origin` at all — so which guard belongs in front of this route is the
 * project's call, added at the wiring like any other middleware. It would not
 * be a security boundary in either case: `Origin` is trusted from browsers and
 * forgeable by everyone else, and volume is a rate limit's job at the edge.
 */
export const serializeAnalytics = (
  leaf: (name: string) => string,
  declarations: AnalyticsDeclaration[],
  globalHTTPPrefix: string = ''
): AnalyticsGenOutput => {
  const imports = declarations
    .map(
      (declaration, index) =>
        `import { ${declaration.variable} as ${alias(index)} } from '${declaration.specifier}'`
    )
    .join('\n')

  const members = declarations
    .flatMap((declaration, index) =>
      declaration.events.map(
        (event) =>
          `  z\n    .object({ name: z.literal('${event}') })\n    .extend(${alias(index)}['${event}'].shape),`
      )
    )
    .join('\n')

  const schemas = `/**
 * Auto-generated analytics ingest schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'
${imports}

/**
 * Every declared event as one discriminated union.
 *
 * The name is the object key in a declaration, so it is reattached here as the
 * discriminator rather than repeated as a \`z.literal\` in every app-owned
 * schema.
 */
export const AnalyticsEventSchema = z.discriminatedUnion('name', [
${members}
])

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>

/**
 * A batch of events from one beacon.
 *
 * Batched because a browser sends these on unload, where one request survives
 * and several may not. Capped at 50 so a single unauthenticated request cannot
 * ask for unbounded work; \`at\` is the client's own clock and a service
 * decides how far to trust it.
 */
export const AnalyticsIngest = z.object({
  events: z
    .array(
      z.object({
        at: z.number().int().optional(),
        event: AnalyticsEventSchema,
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
  AnalyticsIngest,
  AnalyticsIngestOutput,
} from './analytics.schemas.gen.js'

export type { AnalyticsEvent } from './analytics.schemas.gen.js'

/**
 * Unauthenticated by necessity: anonymous visitors are most of what this
 * measures.
 *
 * Identity is stamped by \`services.analyticsLog\` from the session and never read
 * from the body, so there is no field a caller could set to attribute events to
 * someone else. A signed-in request records the user; anything else records
 * nothing — no device storage, no visitor id, no consent banner.
 *
 * Events accepted here are relayed rather than recorded fresh: they carry the
 * browser's own clock and are marked \`source: 'client'\`, which is the only
 * thing separating them from an outcome a function recorded.
 */
export const analyticsIngest = pikkuSessionlessFunc({
  auth: false,
  tags: ['analytics'],
  description: 'Records product-analytics events from a client.',
  input: AnalyticsIngest,
  output: AnalyticsIngestOutput,
  func: async ({ analyticsLog }, { events }) => {
    for (const { at, event } of events) {
      await analyticsLog!.record(event, { at })
    }
    return { accepted: events.length }
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
