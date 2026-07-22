import React, { useMemo, useState } from 'react'
import { Box, Center, Loader } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Globe } from 'lucide-react'
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'
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

// APIs render through the exact same gallery/card/drawer as addons — the only
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

export const ApisList: React.FC<{ searchQuery: string }> = ({
  searchQuery,
}) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const queryClient = useQueryClient()

  const [category, setCategory] = useState('all')

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

  const { data: categoryCounts } = useQuery<Record<string, number>>({
    queryKey: ['openapi-categories'],
    queryFn: async () =>
      (await rpc.invoke('console:getOpenapiCategories')) as Record<
        string,
        number
      >,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // The rail's "All" count: the whole catalogue, independent of the filters
  // applied to the list above.
  const { data: catalogueTotal } = useQuery<number>({
    queryKey: ['openapis', 'total'],
    queryFn: async () => {
      const result = (await rpc.invoke('console:getOpenapis', {
        limit: 1,
        offset: 0,
      })) as { total?: number }
      return result.total ?? 0
    },
    staleTime: 5 * 60 * 1000,
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

  // installOpenapiAddon generates a local addon named @pikku/addon-<slug> and
  // wires it up — it shows up in getInstalledAddons like any other addon.
  const importMutation = useMutation({
    mutationFn: async (api: PackageMeta) =>
      rpc.invoke('console:installOpenapiAddon', {
        name: deriveNamespace(api.name),
        // apiToPackageMeta always sets swaggerUrl — this mutation only ever
        // receives API-kind PackageMeta objects from ApisList's onInstall.
        swaggerUrl: api.swaggerUrl!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
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
      categoryCounts={categoryCounts ?? {}}
      catalogueTotal={catalogueTotal ?? 0}
      total={data.pages[0]?.total ?? 0}
      category={category}
      onCategoryChange={setCategory}
      hasMore={!!hasNextPage}
      loadingMore={isFetchingNextPage}
      onLoadMore={fetchNextPage}
      installedNames={installedNames}
      editable={editable}
      kind="api"
      installingName={
        importMutation.isPending
          ? (importMutation.variables?.name ?? null)
          : null
      }
      actionError={
        importMutation.isError
          ? {
              name: importMutation.variables?.name ?? '',
              message:
                importMutation.error instanceof Error
                  ? importMutation.error.message
                  : String(importMutation.error),
            }
          : null
      }
      onInstall={(api) => importMutation.mutate(api)}
    />
  )
}
