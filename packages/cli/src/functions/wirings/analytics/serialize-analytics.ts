export interface AnalyticsGenOutput {
  schemas: string
  functions: string
}

export interface AnalyticsDeclaration {
  specifier: string
  variable: string
  events: string[]
}

/** So two modules can both export `analyticsEvents` without colliding. */
const alias = (index: number) => `events${index}`

/**
 * Generate the ingest wire and its schemas. No middleware is emitted: an origin
 * lock is not a security boundary and rejects every native client, so which
 * guard belongs here is the project's call.
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

/** The name is the declaration's key, reattached here as the discriminator. */
export const AnalyticsEventSchema = z.discriminatedUnion('name', [
${members}
])

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>

/**
 * Batched because a browser sends these on unload, where one request survives
 * and several may not. Capped so an unauthenticated request cannot ask for
 * unbounded work.
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
 * measures. Identity is stamped from the session and never read from the body,
 * so no caller can attribute events to someone else. Anonymous records nothing
 * — no visitor id, no device storage.
 */
export const analyticsIngest = pikkuSessionlessFunc({
  auth: false,
  tags: ['analytics'],
  description: 'Records product-analytics events from a client.',
  input: AnalyticsIngest,
  output: AnalyticsIngestOutput,
  func: async ({ analytics }, { events }) => {
    for (const { at, event } of events) {
      await analytics!.record(event, { at })
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
