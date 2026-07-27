import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface MiddlewareItem {
  id: string
  name: string
  data: any
}

/**
 * Every middleware definition in the project meta, shared by `MiddlewarePage`
 * and `MiddlewareListPanel` so a host can read the same rows without mounting
 * either.
 */
export const useMiddlewareItems = (): {
  items: MiddlewareItem[]
  loading: boolean
} => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): MiddlewareItem[] => {
    if (!meta.middlewareGroupsMeta) return []
    const definitions = meta.middlewareGroupsMeta.definitions || {}
    const result: MiddlewareItem[] = []
    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      result.push({
        id: `middleware::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    return result
  }, [meta.middlewareGroupsMeta])

  return { items, loading }
}
