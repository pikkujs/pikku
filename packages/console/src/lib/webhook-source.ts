import type { WebhookSourceMeta } from '@pikku/core/trigger'

export interface WebhookSourcePair {
  source: string
  event: string
  meta: WebhookSourceMeta
}

/** A trigger named `<source>:<event>` (or just `<source>`) is fed by that webhook source. */
export const findWebhookSource = (
  name: string,
  sources: Record<string, WebhookSourceMeta> | undefined
): WebhookSourcePair | null => {
  if (!sources) return null
  const colon = name.indexOf(':')
  const source = colon === -1 ? name : name.slice(0, colon)
  const meta = sources[source]
  if (!meta) return null
  return { source, event: colon === -1 ? '' : name.slice(colon + 1), meta }
}

/** The singleton credential a webhook source's signing secret is stored under. */
export const webhookSecretName = (source: string) => `${source}WebhookSecret`
