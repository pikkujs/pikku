import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import {
  toCategoryBuckets,
  type CategoryBucket,
} from '../components/packages/addonCategoryMeta'
import type { CataloguePage } from '../components/packages/packageMeta'

/**
 * The addon catalogue's category buckets and the size of the unfiltered
 * catalogue — the two numbers the browse rail is made of, shared by `AddonsList`
 * and `usePackagesBrowse` so a host can mount the rail on its own surface
 * without the gallery beside it. Both read the same query keys, so mounting
 * them apart still costs one request.
 *
 * Both counts come from the registry rather than the loaded rows: derived counts
 * would only describe the pages already scrolled past, and summing the buckets
 * would overcount every package that declares more than one category.
 */
export const useAddonCategories = (
  enabled = true
): { categories: CategoryBucket[]; catalogueTotal: number } => {
  const rpc = usePikkuRPC()

  const { data: categoryCounts } = useQuery<Record<string, number>>({
    queryKey: ['addon-categories'],
    queryFn: async () =>
      (await rpc.invoke('console:getAddonCategories')) as Record<
        string,
        number
      >,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: catalogueTotal } = useQuery<number>({
    queryKey: ['addons', 'total'],
    queryFn: async () => {
      const result = (await rpc.invoke('console:getAddonMeta', {
        limit: 1,
      })) as CataloguePage
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
