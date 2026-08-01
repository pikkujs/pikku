import React, { useMemo, useState } from 'react'
import { Box, Center, Loader } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Globe } from 'lucide-react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'
import { useOpenapiCategories } from '../../hooks/useOpenapiCategories'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CommunityGallery } from './CommunityGallery'
import { deriveNamespace } from './deriveNamespace'
import type { InstalledAddonRow, PackageMeta } from './packageMeta'
import { PAGE_SIZE } from './packageMeta'

interface OpenApiEntry {
  name: string
  version: string
  provider: string
  service: string | null
  title: string
  description: string
  openapiVer: string
  swaggerUrl: string
  logo?: string
  categories?: string[]
  tags?: string[]
  totalOperations?: number
}

// APIs render through the exact same gallery/card/panel as addons — the only
// difference is the action verb (Import vs Add), handled via `kind` props.
// Mapping into PackageMeta is what makes that reuse possible.
const apiToPackageMeta = (item: OpenApiEntry): PackageMeta => ({
  id: item.name,
  name: item.name,
  displayName: item.title || item.name,
  description: item.description,
  version: item.version,
  author: item.provider,
  icon: item.logo ?? undefined,
  tags: item.tags ?? [],
  categories: item.categories ?? [],
  functions: {},
  agents: {},
  swaggerUrl: item.swaggerUrl,
  totalOperations: item.totalOperations,
})

export const ApisList: React.FC<{
  searchQuery: string
  /** Same contract as `AddonsList` — see its `category` / `onCategoryChange`. */
  category?: string
  onCategoryChange?: (category: string) => void
}> = ({ searchQuery, category: controlledCategory, onCategoryChange }) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()

  const [ownCategory, setOwnCategory] = useState('all')
  const category = controlledCategory ?? ownCategory
  const setCategory = onCategoryChange ?? setOwnCategory
  const withRail = !onCategoryChange
  const { categories, catalogueTotal } = useOpenapiCategories()

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['openapis', { search: searchQuery.trim(), category }],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const result = await rpc.invoke('console:getOpenapis', {
        limit: PAGE_SIZE,
        offset: pageParam,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        ...(category !== 'all' ? { category } : {}),
      })
      return result as {
        apis: OpenApiEntry[]
        total: number
        nextCursor: number | null
      }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: installedAddons } = useQuery<InstalledAddonRow[]>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddonRow[]
    },
    staleTime: 60 * 1000,
  })

  // installOpenapiAddon registers the generated addon under a DERIVED slug
  // (@pikku/addon-<slug>), not the catalogue's own name — map installed
  // slugs back to whichever catalogue entries produced them.
  const installedSlugs = useMemo(
    () =>
      new Set(
        (installedAddons ?? [])
          .filter((a) => a.packageName.startsWith('@pikku/addon-'))
          .map((a) => a.packageName.slice('@pikku/addon-'.length))
      ),
    [installedAddons]
  )

  const apis = useMemo(
    () =>
      (data?.pages ?? []).flatMap((page) =>
        (page.apis ?? []).map(apiToPackageMeta)
      ),
    [data]
  )

  const installedNames = useMemo(
    () =>
      new Set(
        apis
          .filter((api) => installedSlugs.has(deriveNamespace(api.name)))
          .map((api) => api.name)
      ),
    [apis, installedSlugs]
  )

  if (isPending) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  // An empty page under a search or category is "no matches", which the gallery
  // says better — only a catalogue that didn't load at all belongs here.
  if (isError || !data) {
    return (
      <EmptyStatePlaceholder
        icon={Globe}
        title={m.packages_no_apis_title()}
        description={m.packages_no_apis_description()}
        docsHref="https://pikku.dev/docs/external-packages"
      />
    )
  }

  return (
    <CommunityGallery
      addons={apis}
      searchQuery={searchQuery}
      categories={categories}
      catalogueTotal={catalogueTotal}
      withRail={withRail}
      total={data.pages[0]?.total ?? 0}
      category={category}
      onCategoryChange={setCategory}
      hasMore={!!hasNextPage}
      loadingMore={isFetchingNextPage}
      onLoadMore={fetchNextPage}
      installedNames={installedNames}
      editable={editable}
      kind="api"
    />
  )
}
