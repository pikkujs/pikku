import type { AnalyticsEventsMeta } from '@pikku/core/analytics'

export interface AnalyticsGenOutput {
  schemas: string
  functions: string
}

/** One `defineAnalyticsEvents` declaration, as the inspector found it. */
export interface AnalyticsDeclarationMeta {
  file: string
  variable: string
  events: string[]
  props?: Record<string, Record<string, string>>
}

/**
 * The declarations flattened to one entry per event, which is how every reader
 * wants them: an event name belongs to exactly one declaration — the inspector
 * refuses a second — so keying by name loses nothing and spares each caller the
 * walk.
 */
export const buildAnalyticsEventsMeta = (
  declarations: readonly AnalyticsDeclarationMeta[]
): AnalyticsEventsMeta => {
  const meta: AnalyticsEventsMeta = {}
  for (const declaration of declarations) {
    for (const name of declaration.events) {
      const props = declaration.props?.[name]
      meta[name] = {
        name,
        file: declaration.file,
        variable: declaration.variable,
        ...(props ? { props } : {}),
      }
    }
  }
  return meta
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
          `  z\n    .object(${alias(index)}['${event}'].shape)\n    .extend({ name: z.literal('${event}') }),`
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
 * The name is the declaration's key, reattached here as the discriminator —
 * last, so a declaration that happens to carry a 'name' prop of its own
 * cannot overwrite the literal the union discriminates on.
 */
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
 * Re-exported so an app reaches the whole analytics surface through one
 * specifier. Where events go is wired next to where they are declared, and
 * making that import '@pikku/core/analytics' while the event type comes from
 * '#pikku/analytics' splits one concern across two names.
 */
export {
  fanOutAnalytics,
  cookieAnalyticsIdentity,
  composeAnalyticsIdentity,
  anonymousAnalyticsIdentity,
  mintCookie,
  randomDigits,
  LoggerAnalyticsService,
} from '@pikku/core/analytics'
export type {
  AnalyticsIdentity,
  AnalyticsIdentityResolver,
  AnalyticsRecord,
  AnalyticsService,
  AnalyticsSink,
} from '@pikku/core/analytics'

/**
 * Unauthenticated by necessity: anonymous visitors are most of what this
 * measures. Identity is stamped from the session and never read from the body,
 * so no caller can attribute events to someone else. An anonymous visitor is
 * identified only where the app wired a resolver that mints one — nothing here
 * stores anything on a device by itself.
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
