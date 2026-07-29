import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import {
  toCategoryBuckets,
  type CategoryBucket,
} from '../components/packages/addonCategoryMeta'

/**
 * The OpenAPI catalogue's category buckets and total — the API tab's half of the
 * browse rail, shared by `ApisList` and `usePackagesBrowse` exactly as
 * `useAddonCategories` is for addons.
 */
export const useOpenapiCategories = (
  enabled = true
): { categories: CategoryBucket[]; catalogueTotal: number } => {
  const rpc = usePikkuRPC()

  const { data: categoryCounts } = useQuery<Record<string, number>>({
    queryKey: ['openapi-categories'],
    queryFn: async () =>
      (await rpc.invoke('console:getOpenapiCategories')) as Record<
        string,
        number
      >,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: catalogueTotal } = useQuery<number>({
    queryKey: ['openapis', 'total'],
    queryFn: async () => {
      const result = (await rpc.invoke('console:getOpenapis', {
        limit: 1,
        offset: 0,
      })) as { total?: number }
      return result.total ?? 0
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const categories = useMemo(
    () => toCategoryBuckets(categoryCounts ?? {}),
    [categoryCounts]
  )

  return { categories, catalogueTotal: catalogueTotal ?? 0 }
}
