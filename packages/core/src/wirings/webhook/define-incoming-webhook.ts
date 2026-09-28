import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { Logger } from '../../services/logger.js'

export type IncomingWebhookUpsertInput<Needs extends string = string> = {
  /** Where the provider must deliver. Always this deployment's own route: a declaration cannot choose it. */
  url: string
  /** Stable across deploys of this app and stage, so the provider's existing registration can be found by it. */
  label: string
  events: string[]
  /** The secrets named in `needs`, under the names the declaration used. */
  secrets: Record<Needs, string>
  logger: Logger
}

export type IncomingWebhookUpsertResult =
  | { status: 'created'; secret?: string }
  | { status: 'updated' | 'unchanged' }
  /** The provider has no API for this: `instructions` tell a person what to set by hand. */
  | { status: 'manual'; instructions: string }

export type CoreIncomingWebhook<Needs extends string = string> = {
  /** Unique within the app or addon. An addon's is prefixed with the instance name. */
  id: string
  func: CorePikkuFunctionConfig<any, any, any>
  title?: string
  events?: string[]
  /** The secret the provider signs deliveries with, which `upsert` returns when it creates a registration. */
  secret?: string
  /** The secrets `upsert` reads. Nothing else is handed to it. */
  needs?: readonly Needs[]
  /** Only an app may choose its route; an addon's is always `/webhooks/<instance>/<id>`. */
  route?: string
  upsert: (
    input: IncomingWebhookUpsertInput<Needs>
  ) => Promise<IncomingWebhookUpsertResult>
}

export type IncomingWebhookMeta = {
  id: string
  localId: string
  instance?: string
  package?: string
  pikkuFuncId: string
  route: string
  title?: string
  events: string[]
  /** Resolved through the instance's `secretOverrides`. */
  secret?: string
  /** Declared name → the name it resolves to for this instance. */
  needs: Record<string, string>
  exportedName: string
  sourceFile?: string
}

export type IncomingWebhooksMeta = Record<string, IncomingWebhookMeta>

export const defineIncomingWebhook = <const Needs extends string = never>(
  webhook: CoreIncomingWebhook<Needs>
): CoreIncomingWebhook<Needs> => webhook

export const incomingWebhookRoute = (localId: string, instance?: string) =>
  instance ? `/webhooks/${instance}/${localId}` : `/webhooks/${localId}`

export type IncomingWebhookOutcome = {
  id: string
  url: string
  status: IncomingWebhookUpsertResult['status'] | 'failed'
  /** The name the produced signing secret must be stored under. */
  secretName?: string
  secret?: string
  instructions?: string
  error?: string
}

/**
 * Converges every declared incoming webhook with its provider. One failing
 * webhook does not stop the rest: each outcome is reported on its own.
 */
export const upsertIncomingWebhooks = async ({
  definitions,
  meta,
  baseUrl,
  labelPrefix,
  getSecret,
  logger,
}: {
  definitions: Record<string, CoreIncomingWebhook<any>>
  meta: IncomingWebhooksMeta
  /** Where the app's routes are served, e.g. `https://shop.example.com/api`. */
  baseUrl: string
  labelPrefix: string
  getSecret: (name: string) => Promise<string | undefined>
  logger: Logger
}): Promise<IncomingWebhookOutcome[]> => {
  const base = baseUrl.replace(/\/+$/, '')
  const outcomes: IncomingWebhookOutcome[] = []
  for (const entry of Object.values(meta)) {
    const url = `${base}${entry.route}`
    const definition = definitions[entry.id]
    if (!definition) {
      outcomes.push({
        id: entry.id,
        url,
        status: 'failed',
        error: `no definition was generated for '${entry.id}'`,
      })
      continue
    }

    const secrets: Record<string, string> = {}
    const missing: string[] = []
    for (const [declared, resolved] of Object.entries(entry.needs)) {
      const value = await getSecret(resolved)
      if (value) secrets[declared] = value
      else missing.push(resolved)
    }
    if (missing.length > 0) {
      outcomes.push({
        id: entry.id,
        url,
        status: 'failed',
        error: `missing ${missing.join(', ')}`,
      })
      continue
    }

    try {
      const result = await definition.upsert({
        url,
        label: `${labelPrefix}:${entry.id}`,
        events: entry.events,
        secrets,
        logger,
      })
      outcomes.push({
        id: entry.id,
        url,
        status: result.status,
        ...(result.status === 'created' && result.secret && entry.secret
          ? { secretName: entry.secret, secret: result.secret }
          : {}),
        ...(result.status === 'manual'
          ? { instructions: result.instructions }
          : {}),
      })
    } catch (error) {
      outcomes.push({
        id: entry.id,
        url,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return outcomes
}
