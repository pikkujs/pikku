import React, { useMemo, useState } from 'react'
import {
  Box,
  Group,
  Stack,
  Text,
  Badge,
  SimpleGrid,
  SegmentedControl,
  ThemeIcon,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { PackageMeta } from '../../pages/PackagesPage'
import { CategoryRail } from './CategoryRail'
import { AddonCard } from './AddonCard'
import { PublishCta } from './PublishCta'
import { AddonDetailDrawer } from './AddonDetailDrawer'
import { deriveCategories, addonPrimaryCategory } from './addonCategoryMeta'

interface CommunityGalleryProps {
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

type SortKey = 'name' | 'functions' | 'agents'

const fnCount = (a: PackageMeta) => Object.keys(a.functions ?? {}).length
const agentCount = (a: PackageMeta) => Object.keys(a.agents ?? {}).length

export const CommunityGallery: React.FC<CommunityGalleryProps> = ({
  addons,
  searchQuery,
  installedNames,
  installedNamespaces,
  editable,
  installingName,
  actionError,
  kind = 'addon',
  onInstall,
  onOpenInstalled,
}) => {
  useLocale()
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortKey>('name')
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

  const categories = useMemo(() => deriveCategories(addons), [addons])

  const sortData = useMemo(
    () => [
      { value: 'name', label: m.packages_sort_name() },
      { value: 'functions', label: m.packages_sort_functions() },
      { value: 'agents', label: m.packages_sort_agents() },
    ],
    []
  )

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = addons.filter((a) => {
      if (category !== 'all' && addonPrimaryCategory(a) !== category)
        return false
      if (!q) return true
      return (
        a.displayName?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        (a.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) ||
        (a.author ?? '').toLowerCase().includes(q)
      )
    })
    const comparators: Record<
      SortKey,
      (x: PackageMeta, y: PackageMeta) => number
    > = {
      name: (x, y) =>
        (x.displayName || x.name).localeCompare(y.displayName || y.name),
      functions: (x, y) => fnCount(y) - fnCount(x),
      agents: (x, y) => agentCount(y) - agentCount(x),
    }
    return [...list].sort(comparators[sort])
  }, [addons, category, searchQuery, sort])

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
          total={addons.length}
          onPick={setCategory}
        />

        <Stack gap="md" style={{ minWidth: 0, minHeight: '100%' }}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Text fw={700} size="sm">
                {heading}
              </Text>
              <Badge size="sm" variant="light" color="gray">
                {asI18n(String(filtered.length))}
              </Badge>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon size="sm" variant="transparent" color="gray">
                <SlidersHorizontal size={14} />
              </ThemeIcon>
              <SegmentedControl
                size="xs"
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                data={sortData}
              />
            </Group>
          </Group>

          {/* Content region grows to fill, keeping the publish CTA pinned to
              the bottom whether the grid is short or the list is empty. */}
          <Box style={{ flex: 1, minHeight: 0 }}>
            {filtered.length === 0 ? (
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
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {filtered.map((addon) => (
                  <AddonCard
                    key={addon.id}
                    addon={addon}
                    installed={installedNames.has(addon.name)}
                    kind={kind}
                    onOpen={openAddon}
                  />
                ))}
              </SimpleGrid>
            )}
          </Box>

          {kind === 'addon' && <PublishCta />}
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
