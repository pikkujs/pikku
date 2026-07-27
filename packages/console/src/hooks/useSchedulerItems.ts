import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface SchedulerItem {
  name: string
  handler?: string
  schedule?: string
  data: any
}

/**
 * Every scheduled task in the project meta, shared by `SchedulersPage` and
 * `SchedulersListPanel` so a host can read the same rows without mounting
 * either.
 */
export const useSchedulerItems = (): {
  items: SchedulerItem[]
  loading: boolean
} => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): SchedulerItem[] => {
    if (!meta.schedulerMeta) return []
    return Object.entries(meta.schedulerMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        handler: data.pikkuFuncId,
        schedule: data.schedule,
        data,
      })
    )
  }, [meta.schedulerMeta])

  return { items, loading }
}
