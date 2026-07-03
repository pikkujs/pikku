import React, { useMemo, useState } from 'react'
import { useSearchParams } from '../router'
import { PackageDetailPage } from './PackageDetailPage'
import {
  Group,
  Text,
  ThemeIcon,
  Badge,
  TextInput,
  SegmentedControl,
  Box,
  Center,
  Loader,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package, Globe, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { useConsoleEditable } from '../context/ConsoleEditableContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { CommunityGallery } from '../components/packages/CommunityGallery'
import { isOfficialAddon } from '../components/packages/addonCategoryMeta'
import { PanelProvider } from '../context/PanelContext'

type AddonFilter = 'all' | 'official' | 'installed'

export interface PackageMeta {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  icon?: string
  tags: string[]
  categories: string[]
  functions: Record<string, unknown>
  agents: Record<string, unknown>
}

const deriveNamespace = (packageName: string) => {
  const base = packageName
    .replace('@pikku/addon-', '')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
  const namespace = base.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!namespace) {
    throw new Error(
      `Unable to derive namespace from package name: ${packageName}`
    )
  }
  return namespace
}

const AddonsList: React.FC<{
  searchQuery: string
  filter: AddonFilter
}> = ({ searchQuery, filter }) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getAddonMeta')
      return ((result as any)?.packages ?? result ?? []) as PackageMeta[]
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: installedAddons } = useQuery<Array<{ packageName: string }>>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as Array<{ packageName: string }>
    },
    staleTime: 60 * 1000,
  })

  const installMutation = useMutation({
    mutationFn: async (addon: PackageMeta) =>
      rpc.invoke('console:installAddon', {
        packageName: addon.name,
        namespace: deriveNamespace(addon.name),
        version: addon.version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })

  const installedNames = useMemo(
    () => new Set((installedAddons ?? []).map((a) => a.packageName)),
    [installedAddons]
  )

  // All | Official | Installed narrows the same catalogue in place: 'installed'
  // = what the project has wired, 'official' = first-party Pikku packages,
  // 'all' = the full gallery.
  const visible = useMemo(() => {
    const list = data ?? []
    if (filter === 'installed')
      return list.filter((a) => installedNames.has(a.name))
    if (filter === 'official') return list.filter((a) => isOfficialAddon(a.name))
    return list
  }, [data, filter, installedNames])

  if (isLoading) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  if (!data || data.length === 0) {
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
      installedNames={installedNames}
      editable={editable}
      installingName={
        installMutation.isPending
          ? (installMutation.variables?.name ?? null)
          : null
      }
      onInstall={(addon) => installMutation.mutate(addon)}
    />
  )
}

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
}

const API_COLUMNS = [
  {
    key: 'api',
    header: 'API',
    render: (item: OpenApiEntry) => (
      <Group gap="sm" wrap="nowrap">
        {item.logo ? (
          <img
            src={item.logo}
            width={28}
            height={28}
            alt={item.title}
            style={{ objectFit: 'contain', display: 'block', borderRadius: 4 }}
          />
        ) : (
          <ThemeIcon size={28} radius="sm" variant="light" color="gray">
            <Globe size={16} />
          </ThemeIcon>
        )}
        <div>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">
              {asI18n(item.title || item.name)}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {asI18n(item.openapiVer)}
            </Badge>
          </Group>
          {item.description && (
            <Text size="sm" c="dimmed" truncate style={{ maxWidth: 400 }}>
              {asI18n(item.description)}
            </Text>
          )}
        </div>
      </Group>
    ),
  },
  {
    key: 'provider',
    header: 'PROVIDER',
    render: (item: OpenApiEntry) => (
      <Text size="sm">{asI18n(item.provider)}</Text>
    ),
  },
  {
    key: 'operations',
    header: 'OPS',
    render: (item: any) => (
      <Text size="sm">{asI18n(String(item.totalOperations ?? '-'))}</Text>
    ),
  },
]

const ApisList: React.FC<{
  searchQuery: string
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ searchQuery, onSelect }) => {
  const rpc = usePikkuRPC()
  useLocale()

  const { data, isLoading } = useQuery({
    queryKey: ['openapis'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getOpenapis', {
        limit: 100,
        offset: 0,
      })
      return result as { apis: OpenApiEntry[]; total: number }
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const filtered = useMemo(() => {
    if (!searchQuery) return data?.apis ?? []
    const q = searchQuery.toLowerCase()
    return (data?.apis ?? []).filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        item.provider?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  return (
    <TableListPage
      title={`APIs (${data?.total ?? '...'})`}
      icon={Globe}
      docsHref="https://pikku.dev/docs/external-packages"
      data={filtered}
      columns={API_COLUMNS}
      getKey={(item) => item.name}
      onRowClick={(item) => onSelect(item.name, 'api' as any)}
      emptyTitle={m.packages_no_apis_title()}
      emptyDescription={m.packages_no_apis_description()}
      loading={isLoading}
    />
  )
}

type MainTab = 'addons' | 'apis'

const PackagesList: React.FC<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ onSelect }) => {
  const [tab, setTab] = useState<MainTab>('addons')
  const [filter, setFilter] = useState<AddonFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setTab(value as MainTab)
  }

  const mainTabs = [
    { value: 'addons', label: m.packages_tab_addons() },
    { value: 'apis', label: m.packages_tab_apis() },
  ]
  const addonFilters = [
    { value: 'all', label: m.packages_filter_all() },
    { value: 'official', label: m.packages_filter_official() },
    { value: 'installed', label: m.packages_filter_installed() },
  ]

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={m.packages_title()}
          description={m.packages_description()}
          docsHref="https://pikku.dev/docs/external-packages"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={
                  tab === 'apis'
                    ? m.packages_search_apis_placeholder()
                    : m.packages_search_addons_placeholder()
                }
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              {tab === 'addons' && (
                <SegmentedControl
                  size="xs"
                  value={filter}
                  onChange={(v) => setFilter(v as AddonFilter)}
                  data={addonFilters}
                />
              )}
              <SegmentedControl
                size="xs"
                value={tab}
                onChange={handleTabChange}
                data={mainTabs}
              />
            </Group>
          }
        />
      }
    >
      {tab === 'apis' ? (
        <ApisList searchQuery={searchQuery} onSelect={onSelect} />
      ) : (
        <AddonsList searchQuery={searchQuery} filter={filter} />
      )}
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const source = (searchParams.get('source') ?? 'community') as
    | 'installed'
    | 'community'
    | 'api'

  if (selectedId) {
    return (
      <PackageDetailPage
        id={selectedId}
        source={source}
        onBack={() => setSearchParams({})}
      />
    )
  }

  return (
    <PackagesList
      onSelect={(id, src) => setSearchParams({ id, source: src })}
    />
  )
}

// `emptyHero` is accepted for backwards compat with the fabric console shell
// but no longer used — the addons tab always renders its own gallery/empty state.
export const PackagesPage: React.FC<{ emptyHero?: React.ReactNode }> = () => {
  return (
    <PanelProvider>
      <PackagesPageContent />
    </PanelProvider>
  )
}
