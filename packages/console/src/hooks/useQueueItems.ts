import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface QueueItem {
  name: string
  handler?: string
  concurrency?: number
  data: any
}

/**
 * Every queue in the project meta, shared by `QueuesPage` and
 * `QueuesListPanel` so a host can read the same rows without mounting either.
 */
export const useQueueItems = (): { items: QueueItem[]; loading: boolean } => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): QueueItem[] => {
    if (!meta.queueMeta) return []
    return Object.entries(meta.queueMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        handler: data.pikkuFuncId,
        concurrency: data.concurrency,
        data,
      })
    )
  }, [meta.queueMeta])

  return { items, loading }
}
