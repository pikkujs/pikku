import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import type { WeavePiece } from './types'

export function useAddonWeavePieces(): WeavePiece[] {
  const rpc = usePikkuRPC()
  const { data } = useQuery({
    queryKey: ['console:getInstalledAddons'],
    queryFn: () => rpc.invoke('console:getInstalledAddons'),
  })
  return useMemo(
    () =>
      (Array.isArray(data) ? data : []).map((addon: { packageName: string; namespace?: string }) => ({
        id: `addon:${addon.packageName}`,
        type: 'addon' as const,
        name: addon.namespace || addon.packageName.replace(/^@pikku\/addon-/, ''),
        meta: { name: addon.packageName },
      })),
    [data]
  )
}
