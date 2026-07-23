import React, { useMemo, useState } from 'react'
import { Box, Center, Loader } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package } from 'lucide-react'
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
import type { SortKey } from './CommunityGallery'
import { deriveNamespace } from './deriveNamespace'
import type {
  AddonFilter,
  CataloguePage,
  InstalledAddonRow,
  PackageMeta,
} from './packageMeta'
import { PAGE_SIZE, installedToPackageMeta } from './packageMeta'

// The registry caps a page at 500 rows.
const MAX_PAGE = 500

const matchesSearch = (addon: PackageMeta, search: string) => {
  const q = search.toLowerCase()
  return (
    addon.name.toLowerCase().includes(q) ||
    addon.displayName.toLowerCase().includes(q) ||
    addon.description.toLowerCase().includes(q) ||
    addon.tags.some((tag) => tag.toLowerCase().includes(q))
  )
}

export const AddonsList: React.FC<{
  searchQuery: string
  filter: AddonFilter
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ searchQuery, filter, onSelect }) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('name')

  const { data: installedAddons } = useQuery<InstalledAddonRow[]>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddonRow[]
    },
    staleTime: 60 * 1000,
  })

  // The Installed view is a left join on what the project has actually wired,
  // NOT an intersection with the catalogue — a local or unpublished addon is
  // installed but absent from the registry, and intersecting would hide it. So
  // it fetches the catalogue rows for exactly those names (a bounded set) and
  // filters client-side; every other view is paged and filtered by the server.
  const isInstalledView = filter === 'installed'
  const installedFilterReady = !isInstalledView || !!installedAddons

  const installedNames = useMemo(
    () => new Set((installedAddons ?? []).map((a) => a.packageName)),
    [installedAddons]
  )

  // packageName → the wireAddon names it's installed under, so the drawer can
  // show existing instances (the same package can be wired several times).
  const installedNamespaces = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const a of installedAddons ?? []) {
      ;(map[a.packageName] ??= []).push(a.namespace)
    }
    return map
  }, [installedAddons])

  const search = searchQuery.trim()

  const queryArgs = useMemo(
    () =>
      isInstalledView
        ? { names: [...installedNames].join(',') }
        : {
            ...(search ? { search } : {}),
            ...(category !== 'all' ? { category } : {}),
            ...(filter === 'official' ? { official: true } : {}),
            sort,
          },
    [isInstalledView, installedNames, search, category, filter, sort]
  )

  const pageSize = isInstalledView
    ? Math.min(Math.max(installedNames.size, 1), MAX_PAGE)
    : PAGE_SIZE

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['addons', queryArgs, pageSize],
    // The registry pages by row offset, handed back as `nextCursor`.
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await rpc.invoke('console:getAddonMeta', {
        ...queryArgs,
        limit: pageSize,
        ...(pageParam != null ? { cursor: pageParam } : {}),
      })
      return result as CataloguePage
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Waiting avoids firing an unfiltered request first and flashing the
    // whole catalogue into the Installed view.
    enabled: installedFilterReady,
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: categoryCounts } = useQuery<Record<string, number>>({
    queryKey: ['addon-categories'],
    queryFn: async () =>
      (await rpc.invoke('console:getAddonCategories')) as Record<
        string,
        number
      >,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // The "All" count in the rail is the size of the unfiltered catalogue, so it
  // can't come from the filtered list query above.
  const { data: catalogueTotal } = useQuery<number>({
    queryKey: ['addons', 'total'],
    queryFn: async () => {
      const result = (await rpc.invoke('console:getAddonMeta', {
        limit: 1,
      })) as CataloguePage
      return result.total ?? 0
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const catalogue = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.packages ?? []),
    [data]
  )

  const visible = useMemo(() => {
    if (!isInstalledView) return catalogue
    const byName = new Map(catalogue.map((a) => [a.name, a]))
    let rows = (installedAddons ?? []).map(
      (a) => byName.get(a.packageName) ?? installedToPackageMeta(a)
    )
    // Synthesised rows never reach the registry, so search and category have to
    // be applied here for the Installed view to filter them at all.
    if (search) rows = rows.filter((a) => matchesSearch(a, search))
    if (category !== 'all') {
      rows = rows.filter((a) => a.categories.includes(category))
    }
    return rows
  }, [isInstalledView, catalogue, installedAddons, search, category])

  const installMutation = useMutation({
    mutationFn: async ({
      addon,
      namespace,
    }: {
      addon: PackageMeta
      namespace?: string
    }) =>
      rpc.invoke('console:installAddon', {
        packageName: addon.name,
        namespace: namespace?.trim() || deriveNamespace(addon.name),
        version: addon.version,
      }),
    onSuccess: (_result, { addon }) => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      // Land the user on the freshly installed addon's setup surface so they
      // can immediately connect its integrations / set its secrets.
      onSelect(addon.name, 'installed')
    },
  })

  if (isPending) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  // Only an unreachable registry is an error state. An empty result under a
  // search or filter is the gallery's own "no matches", not a broken catalogue.
  if (isError || !data) {
    return (
      <EmptyStatePlaceholder
        icon={Package}
        title={m.packages_registry_unavailable_title()}
        description={m.packages_registry_unavailable_description()}
        docsHref="https://pikku.dev/docs/external-packages"
      />
    )
  }

  return (
    <CommunityGallery
      addons={visible}
      searchQuery={searchQuery}
      categoryCounts={categoryCounts ?? {}}
      catalogueTotal={catalogueTotal ?? 0}
      total={isInstalledView ? visible.length : (data.pages[0]?.total ?? 0)}
      category={category}
      onCategoryChange={setCategory}
      sort={isInstalledView ? undefined : sort}
      onSortChange={isInstalledView ? undefined : setSort}
      hasMore={!isInstalledView && !!hasNextPage}
      loadingMore={isFetchingNextPage}
      onLoadMore={fetchNextPage}
      installedNames={installedNames}
      installedNamespaces={installedNamespaces}
      editable={editable}
      installingName={
        installMutation.isPending
          ? (installMutation.variables?.addon.name ?? null)
          : null
      }
      actionError={
        installMutation.isError
          ? {
              name: installMutation.variables?.addon.name ?? '',
              message:
                installMutation.error instanceof Error
                  ? installMutation.error.message
                  : String(installMutation.error),
            }
          : null
      }
      onInstall={(addon, namespace) =>
        installMutation.mutate({ addon, namespace })
      }
      onOpenInstalled={(addon) => onSelect(addon.name, 'installed')}
    />
  )
}
