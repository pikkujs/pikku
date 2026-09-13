import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

/**
 * Every enabled gateway in the project meta, sorted by name — shared by
 * `GatewaysPage` and `GatewaysListPanel` so a host can read the same rows
 * without mounting either.
 */
export const useGatewayItems = (): { items: any[]; loading: boolean } => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo(() => {
    if (!meta.gatewayMeta) return []
    return [...meta.gatewayMeta]
      .filter((gateway: any) => gateway.enabled !== false)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }, [meta.gatewayMeta])

  return { items, loading }
}
