import React, { useMemo, useState } from 'react'
import { Box } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package } from 'lucide-react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'
import { useAddonCategories } from '../../hooks/useAddonCategories'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CommunityGallery } from './CommunityGallery'
import type { SortKey } from './CommunityGallery'
import type {
  AddonFilter,
  CataloguePage,
  InstalledAddonRow,
  PackageMeta,
} from './packageMeta'
import { PAGE_SIZE, installedToPackageMeta } from './packageMeta'
import { ConsoleLoading } from '../ui/ConsoleLoading'

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
  /**
   * Hand these in (from `usePackagesBrowse`) to drive the category from a rail
   * the host mounted elsewhere; omit them and the list owns its own, with the
   * rail inside the gallery.
   */
  category?: string
  onCategoryChange?: (category: string) => void
}> = ({
  searchQuery,
  filter,
  onSelect,
  category: controlledCategory,
  onCategoryChange,
}) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const [ownCategory, setOwnCategory] = useState('all')
  const category = controlledCategory ?? ownCategory
  const setCategory = onCategoryChange ?? setOwnCategory
  const withRail = !onCategoryChange
  const [sort, setSort] = useState<SortKey>('name')
  const { categories, catalogueTotal } = useAddonCategories()

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

  if (isPending) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ConsoleLoading />
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
      categories={categories}
      catalogueTotal={catalogueTotal}
      withRail={withRail}
      total={isInstalledView ? visible.length : (data.pages[0]?.total ?? 0)}
      category={category}
      onCategoryChange={setCategory}
      sort={isInstalledView ? undefined : sort}
      onSortChange={isInstalledView ? undefined : setSort}
      hasMore={!isInstalledView && !!hasNextPage}
      loadingMore={isFetchingNextPage}
      onLoadMore={fetchNextPage}
      installedNames={installedNames}
      editable={editable}
      onOpenInstalled={(addon) => onSelect(addon.name, 'installed')}
    />
  )
}
