import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
}

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
      .map((name) => ({
        name,
        source: meta.triggerSourceMeta?.[name] || null,
        trigger: meta.triggerMeta?.[name] || null,
      }))
  }, [meta.triggerMeta, meta.triggerSourceMeta])

  return { items, loading }
}
