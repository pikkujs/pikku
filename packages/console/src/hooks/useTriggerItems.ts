import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import {
  findWebhookSource,
  type WebhookSourcePair,
} from '../lib/webhook-source'

export type { WebhookSourcePair }

export interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
  webhook: WebhookSourcePair | null
}

/** What the source panel is opened with: the plain source meta, or the webhook it comes from. */
export const sourcePanelMetadata = (pair: TriggerPair) =>
  pair.webhook ? { kind: 'webhook', ...pair.webhook } : pair.source

/**
 * Every trigger name in the project meta paired with its source and its
 * trigger, either of which may be missing. Shared by `TriggersPage` and
 * `TriggersListPanel` so a host can read the same rows without mounting either.
 */
export const useTriggerItems = (): {
  items: TriggerPair[]
  loading: boolean
} => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): TriggerPair[] => {
    const names = new Set<string>()
    if (meta.triggerSourceMeta)
      Object.keys(meta.triggerSourceMeta).forEach((n) => names.add(n))
    if (meta.triggerMeta)
      Object.keys(meta.triggerMeta).forEach((n) => names.add(n))
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
  }, [meta.triggerMeta, meta.triggerSourceMeta, meta.webhookSourceMeta])

  return { items, loading }
}
