import type { WebhookSourceMeta } from '@pikku/core/trigger'
import { findWebhookSource, type WebhookSourcePair } from './webhook-source'
import { toEnglishName } from './strings'

export interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
  webhook: WebhookSourcePair | null
}

/** Every trigger name paired with its source (a trigger source or a webhook source) and its trigger. */
export const pairTriggers = (meta: {
  triggerMeta?: Record<string, any>
  triggerSourceMeta?: Record<string, any>
  webhookSourceMeta?: Record<string, WebhookSourceMeta>
}): TriggerPair[] => {
  const names = new Set<string>()
  Object.keys(meta.triggerSourceMeta ?? {}).forEach((n) => names.add(n))
  Object.keys(meta.triggerMeta ?? {}).forEach((n) => names.add(n))
  return Array.from(names)
    .sort()
    .map((name) => {
      const source = meta.triggerSourceMeta?.[name] || null
      return {
        name,
        source,
        trigger: meta.triggerMeta?.[name] || null,
        webhook: source
          ? null
          : findWebhookSource(name, meta.webhookSourceMeta),
      }
    })
}

export const hasSource = (pair: TriggerPair) => !!(pair.source || pair.webhook)

export const triggerCounts = (pairs: TriggerPair[]) => ({
  total: pairs.length,
  listening: pairs.filter(hasSource).length,
  running: pairs.filter((p) => p.trigger).length,
  incomplete: pairs.filter((p) => !hasSource(p) || !p.trigger).length,
})

export const matchesTriggerQuery = (pair: TriggerPair, query: string) =>
  !query ||
  [
    pair.name,
    toEnglishName(pair.name),
    pair.source?.pikkuFuncId,
    pair.webhook?.source,
    pair.webhook?.meta.route,
    pair.trigger?.pikkuFuncId,
  ].some((v) => v?.toLowerCase().includes(query))

/** What the source panel is opened with: the plain source meta, or the webhook it comes from. */
export const sourcePanelMetadata = (pair: TriggerPair) =>
  pair.webhook ? { kind: 'webhook', ...pair.webhook } : pair.source
