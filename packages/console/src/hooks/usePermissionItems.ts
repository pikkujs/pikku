import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface PermissionItem {
  id: string
  name: string
  data: any
}

/**
 * Every permission definition in the project meta, shared by `PermissionsPage`
 * and `PermissionsListPanel` so a host can read the same rows without mounting
 * either.
 */
export const usePermissionItems = (): {
  items: PermissionItem[]
  loading: boolean
} => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): PermissionItem[] => {
    if (!meta.permissionsGroupsMeta) return []
    const definitions = meta.permissionsGroupsMeta.definitions || {}
    const result: PermissionItem[] = []

    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      if (def.exportedName === null) continue
      result.push({
        id: `permission::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    return result
  }, [meta.permissionsGroupsMeta])

  return { items, loading }
}
