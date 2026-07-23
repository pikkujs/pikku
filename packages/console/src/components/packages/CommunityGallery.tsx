import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Group,
  Stack,
  Text,
  Badge,
  SimpleGrid,
  SegmentedControl,
  ThemeIcon,
  Loader,
  Center,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { PackageMeta } from './packageMeta'
import { CategoryRail } from './CategoryRail'
import { AddonCard } from './AddonCard'
import { PublishCta } from './PublishCta'
import { AddonDetailDrawer } from './AddonDetailDrawer'
import { toCategoryBuckets } from './addonCategoryMeta'

export type SortKey = 'name' | 'functions' | 'agents'

interface CommunityGalleryProps {
  /** The rows loaded so far — already searched, filtered and sorted server-side. */
  addons: PackageMeta[]
  searchQuery: string
  installedNames: Set<string>
  /** packageName → the wireAddon names it's installed under (for the drawer). */
  installedNamespaces?: Record<string, string[]>
  editable: boolean
  installingName: string | null
  /** The most recent install/import failure, if any — shown inline in the drawer for that addon. */
  actionError?: { name: string; message: string } | null
  /** 'api' swaps card/drawer wording to Import and hides the publish CTA. */
  kind?: 'addon' | 'api'
  /**
   * Catalogue-wide category counts, from the registry. Derived counts would
   * only describe the pages already scrolled past.
   */
  categoryCounts: Record<string, number>
  /**
   * Size of the unfiltered catalogue — the rail's "All" count. Summing
   * `categoryCounts` would overcount every package that declares more than one
   * category.
   */
  catalogueTotal: number
  /** How many rows match the current search/filter across the whole catalogue. */
  total: number
  category: string
  onCategoryChange: (category: string) => void
  /**
   * Sorting is the registry's, so it is offered only where the registry can do
   * it. The OpenAPI catalogue orders by name alone — omit both and the control
   * is hidden rather than left inert.
   */
  sort?: SortKey
  onSortChange?: (sort: SortKey) => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** `namespace` is the user-chosen wireAddon name (addons only); APIs ignore it. */
  onInstall: (addon: PackageMeta, namespace?: string) => void
  /**
   * Opening an *installed* addon: routes to its full detail page (which carries
   * the Setup/OAuth + secrets requirements and richer surfaces) instead of the
   * lightweight browse drawer. Omitted for the API gallery, which has no such
   * page, so those cards always open the drawer.
   */
  onOpenInstalled?: (addon: PackageMeta) => void
}

export const CommunityGallery: React.FC<CommunityGalleryProps> = ({
  addons,
  searchQuery,
  installedNames,
  installedNamespaces,
  editable,
  installingName,
  actionError,
  kind = 'addon',
  categoryCounts,
  catalogueTotal,
  total,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  hasMore,
  loadingMore,
  onLoadMore,
  onInstall,
  onOpenInstalled,
}) => {
  useLocale()
  const [selected, setSelected] = useState<PackageMeta | null>(null)

  // An installed addon opens its full detail page (Setup/OAuth lives there); a
  // not-yet-installed one opens the browse drawer to preview before installing.
  const openAddon = (addon: PackageMeta) => {
    if (onOpenInstalled && installedNames.has(addon.name)) {
      onOpenInstalled(addon)
    } else {
      setSelected(addon)
    }
  }

  const categories = useMemo(
    () => toCategoryBuckets(categoryCounts),
    [categoryCounts]
  )

  const sortData = useMemo(
    () => [
      { value: 'name', label: m.packages_sort_name() },
      { value: 'functions', label: m.packages_sort_functions() },
      { value: 'agents', label: m.packages_sort_agents() },
    ],
    []
  )

  // Pull the next page when the sentinel below the grid scrolls into view.
  // `onLoadMore` is read through a ref so the observer isn't torn down and
  // rebuilt on every render — which would re-fire while it re-intersects.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef(onLoadMore)
  loadMoreRef.current = onLoadMore

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loadingMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRef.current()
        }
      },
      // Start fetching a screenful early so scrolling doesn't visibly stall.
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadingMore])

  const heading =
    category === 'all'
      ? searchQuery.trim()
        ? m.packages_results()
        : kind === 'api'
          ? m.packages_all_apis()
          : m.packages_all_addons()
      : asI18n(categories.find((c) => c.id === category)?.label ?? category)

  return (
    <Stack gap="lg" style={{ minHeight: '100%' }}>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 210px) minmax(0, 1fr)',
          gap: 'var(--mantine-spacing-xl)',
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
        }}
      >
        <CategoryRail
          categories={categories}
          active={category}
          total={catalogueTotal}
          onPick={onCategoryChange}
        />

        <Stack gap="md" style={{ minWidth: 0, minHeight: '100%' }}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Text fw={700} size="sm">
                {heading}
              </Text>
              <Badge size="sm" variant="light" color="gray">
                {asI18n(String(total))}
              </Badge>
            </Group>
            {sort && onSortChange && (
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size="sm" variant="transparent" color="gray">
                  <SlidersHorizontal size={14} />
                </ThemeIcon>
                <SegmentedControl
                  size="xs"
                  value={sort}
                  onChange={(v) => onSortChange(v as SortKey)}
                  data={sortData}
                />
              </Group>
            )}
          </Group>

          {/* Content region grows to fill, keeping the publish CTA pinned to
              the bottom whether the grid is short or the list is empty. */}
          <Box style={{ flex: 1, minHeight: 0 }}>
            {addons.length === 0 ? (
              <Stack align="center" justify="center" gap={6} h="100%">
                <ThemeIcon size={48} radius="md" variant="light" color="gray">
                  <Search size={22} />
                </ThemeIcon>
                <Text fw={600} size="sm">
                  {m.packages_no_matches()}
                </Text>
                <Text size="sm" c="dimmed">
                  {m.packages_no_matches_hint()}
                </Text>
              </Stack>
            ) : (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                  {addons.map((addon) => (
                    <AddonCard
                      key={addon.id}
                      addon={addon}
                      installed={installedNames.has(addon.name)}
                      kind={kind}
                      onOpen={openAddon}
                    />
                  ))}
                </SimpleGrid>
                {hasMore && (
                  <Box ref={sentinelRef} py="lg">
                    <Center>
                      <Loader size="sm" />
                    </Center>
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* Publishing is an authoring action — hide it on a read-only console
              (e.g. a deployed stage) where you can't install or edit anyway. */}
          {kind === 'addon' && editable && <PublishCta />}
        </Stack>
      </Box>

      <AddonDetailDrawer
        addon={selected}
        installed={selected ? installedNames.has(selected.name) : false}
        installing={!!selected && installingName === selected.name}
        installedNamespaces={
          selected ? (installedNamespaces?.[selected.name] ?? []) : []
        }
        error={
          selected && actionError?.name === selected.name
            ? actionError.message
            : null
        }
        editable={editable}
        kind={kind}
        onClose={() => setSelected(null)}
        onInstall={onInstall}
      />
    </Stack>
  )
}
