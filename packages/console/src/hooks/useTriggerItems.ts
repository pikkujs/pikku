import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { pairTriggers, type TriggerPair } from '../lib/trigger-pairs'

export type { TriggerPair } from '../lib/trigger-pairs'
export { sourcePanelMetadata } from '../lib/trigger-pairs'
export type { WebhookSourcePair } from '../lib/webhook-source'

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

  const items = useMemo(
    () => pairTriggers(meta),
    [meta.triggerMeta, meta.triggerSourceMeta, meta.webhookSourceMeta]
  )

  return { items, loading }
}
