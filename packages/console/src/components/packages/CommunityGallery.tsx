import React, { useEffect, useRef } from 'react'
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  SimpleGrid,
  ThemeIcon,
  Loader,
  Center,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Search } from 'lucide-react'
import type { PackageMeta } from './packageMeta'
import { CategoryRail } from './CategoryRail'
import { AddonCard, type AddonCardStatus } from './AddonCard'
import { getCategoryMeta, type CategoryBucket } from './addonCategoryMeta'
import { QUICK_JOBS } from './addonJobs'
import { readInstallResult } from './installResult'
import { usePanelContext } from '../../context/PanelContext'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevLinks, DevNote } from '../ui/DevDetail'

export type SortKey = 'name' | 'functions' | 'agents'

interface CommunityGalleryProps {
  addons: PackageMeta[]
  searchQuery: string
  onSearchChange: (query: string) => void
  installedNames: Set<string>
  editable: boolean
  kind?: 'addon' | 'api'
  categories: CategoryBucket[]
  catalogueTotal: number
  withRail?: boolean
  total: number
  category: string
  onCategoryChange: (category: string) => void
  inApp?: PackageMeta[]
  popular?: PackageMeta[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onOpenInstalled?: (addon: PackageMeta) => void
}

export const CommunityGallery: React.FC<CommunityGalleryProps> = ({
  addons,
  searchQuery,
  onSearchChange,
  installedNames,
  editable,
  kind = 'addon',
  categories,
  catalogueTotal,
  withRail = true,
  total,
  category,
  onCategoryChange,
  inApp,
  popular,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenInstalled,
}) => {
  useLocale()
  const { openPanel } = usePanelContext()
  const queryClient = useQueryClient()
  const isApi = kind === 'api'

  const openAddon = (addon: PackageMeta) => {
    if (onOpenInstalled && installedNames.has(addon.name)) {
      onOpenInstalled(addon)
      return
    }
    openPanel('addon', addon.id, addon.displayName || addon.name, {
      addon,
      kind,
      editable,
      onInstalled: onOpenInstalled ? () => onOpenInstalled(addon) : undefined,
    })
  }

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
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadingMore])

  const search = searchQuery.trim()
  const shownInApp = inApp && inApp.length > 0 ? inApp : undefined
  const shownPopular = popular && popular.length > 0 ? popular : undefined
  const featured = new Set(
    [...(shownInApp ?? []), ...(shownPopular ?? [])].map((a) => a.name)
  )
  const rest = addons.filter((a) => !featured.has(a.name))
  const restTotal = Math.max(total - (addons.length - rest.length), 0)

  const heading = search
    ? m.integrations_results_title({ query: search })
    : category !== 'all'
      ? asI18n(categories.find((c) => c.id === category)?.label ?? category)
      : featured.size > 0
        ? m.integrations_more_title()
        : isApi
          ? m.integrations_all_apis()
          : m.integrations_all_title()

  const jobs = isApi
    ? categories.slice(0, 6)
    : QUICK_JOBS.map((id) => categories.find((c) => c.id === id)).filter(
        (c): c is CategoryBucket => !!c
      )

  const inAppStatus = (addon: PackageMeta): AddonCardStatus => {
    const result = readInstallResult(queryClient, addon.name)
    if (!result) {
      return {
        tone: 'good',
        label: m.integrations_status_added(),
        next: m.integrations_next_check(),
      }
    }
    if (result.missingSecrets.length + result.missingVariables.length > 0) {
      return {
        tone: 'warn',
        label: m.integrations_status_needs_keys(),
        next: m.integrations_next_keys(),
      }
    }
    return {
      tone: 'good',
      label: m.integrations_status_ready(),
      next: m.integrations_next_ready(),
    }
  }

  const rows = (list: PackageMeta[], withStatus = false) => (
    <Box mt="md" style={{ containerType: 'inline-size' }}>
      <SimpleGrid type="container" cols={{ base: 1, '640px': 2 }} spacing="sm">
        {list.map((addon) => (
          <AddonCard
            key={addon.id}
            addon={addon}
            installed={installedNames.has(addon.name)}
            kind={kind}
            status={withStatus ? inAppStatus(addon) : undefined}
            onOpen={openAddon}
          />
        ))}
      </SimpleGrid>
    </Box>
  )

  const cards = (
    <CardsPage>
      <SectionCard
        testId="integrations-hero"
        hero
        title={
          isApi ? m.integrations_apis_hero_title() : m.integrations_hero_title()
        }
        blurb={
          isApi ? m.integrations_apis_hero_blurb() : m.integrations_hero_blurb()
        }
      >
        <Stack gap="sm" mt="md">
          <TextInput
            data-testid="packages-search"
            aria-label={m.integrations_search_label()}
            placeholder={
              isApi
                ? m.integrations_search_apis_placeholder()
                : m.integrations_search_placeholder()
            }
            leftSection={<Search size={16} />}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
          />
          {jobs.length > 0 && (
            <Group gap={8}>
              <Button
                size="xs"
                radius="xl"
                variant={category === 'all' ? 'light' : 'default'}
                onClick={() => onCategoryChange('all')}
              >
                {m.integrations_all()}
              </Button>
              {jobs.map((job) => {
                const { icon: Icon } = getCategoryMeta(job.id)
                return (
                  <Button
                    key={job.id}
                    size="xs"
                    radius="xl"
                    variant={category === job.id ? 'light' : 'default'}
                    leftSection={<Icon size={14} />}
                    onClick={() => onCategoryChange(job.id)}
                  >
                    {asI18n(job.label)}
                  </Button>
                )
              })}
            </Group>
          )}
        </Stack>
      </SectionCard>

      {shownInApp && (
        <SectionCard
          testId="integrations-in-app"
          title={m.integrations_in_app_title()}
          subtitle={asI18n(String(shownInApp.length))}
          blurb={m.integrations_in_app_blurb()}
        >
          {rows(shownInApp, true)}
        </SectionCard>
      )}

      {shownPopular && (
        <SectionCard
          testId="integrations-popular"
          title={m.integrations_popular_title()}
          blurb={m.integrations_popular_blurb()}
        >
          {rows(shownPopular)}
        </SectionCard>
      )}

      <SectionCard
        testId="integrations-browse"
        title={heading}
        subtitle={
          restTotal === 1
            ? m.integrations_count_one()
            : m.integrations_count({ count: restTotal })
        }
        blurb={m.integrations_browse_blurb()}
        footer={
          <ForDevelopers
            attached
            label={m.integrations_dev_label()}
            hint={m.integrations_dev_hint()}
            testId="integrations-developers"
          >
            <DevNote>
              {isApi ? m.integrations_dev_body_apis() : m.integrations_dev_body()}
            </DevNote>
            <DevLinks
              links={[
                {
                  href: 'https://pikku.dev/docs/external-packages',
                  label: m.packages_docs(),
                },
              ]}
            />
            {editable && !isApi && (
              <Group justify="space-between" gap="sm">
                <DevNote>{m.packages_publish_subtext()}</DevNote>
                <Button
                  component="a"
                  href="https://pikku.dev/docs/external-packages"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="default"
                  size="xs"
                  rightSection={<ArrowRight size={14} />}
                >
                  {m.packages_publish_cta()}
                </Button>
              </Group>
            )}
          </ForDevelopers>
        }
      >
        {rest.length === 0 && addons.length === 0 ? (
          <Stack align="center" gap={6} py="xl">
            <ThemeIcon size={40} radius="md" variant="light" color="gray">
              <Search size={20} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {m.integrations_no_matches()}
            </Text>
            <Text size="sm" c="dimmed">
              {m.packages_no_matches_hint()}
            </Text>
          </Stack>
        ) : (
          <>
            {rows(rest)}
            {hasMore && (
              <Box ref={sentinelRef} py="lg">
                <Center>
                  <Loader size="sm" />
                </Center>
              </Box>
            )}
          </>
        )}
      </SectionCard>
    </CardsPage>
  )

  if (!withRail) return cards

  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 210px) minmax(0, 1fr)',
        gap: 'var(--mantine-spacing-xl)',
        alignItems: 'start',
      }}
    >
      <CategoryRail
        categories={categories}
        active={category}
        total={catalogueTotal}
        onPick={onCategoryChange}
      />
      {cards}
    </Box>
  )
}
