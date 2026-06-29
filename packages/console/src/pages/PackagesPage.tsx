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
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { Package, Globe, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PanelProvider } from '../context/PanelContext'

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

interface InstalledAddon {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

const PackageIcon: React.FC<{ icon?: string; name: string }> = ({
  icon,
  name,
}) => {
  if (icon) {
    const src = icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`
      : icon
    return (
      <img
        src={src}
        width={28}
        height={28}
        alt={name}
        style={{ objectFit: 'contain', display: 'block', borderRadius: 4 }}
      />
    )
  }
  return (
    <ThemeIcon size={28} radius="sm" variant="light" color="gray">
      <Package size={16} />
    </ThemeIcon>
  )
}

const COMMUNITY_COLUMNS = (installedNames: Set<string>, t: (key: string) => any) => [
  {
    key: 'package',
    header: 'PACKAGE',
    render: (item: PackageMeta) => (
      <Group gap="sm" wrap="nowrap">
        <PackageIcon icon={item.icon} name={item.displayName} />
        <div>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">
              {asI18n(item.displayName || item.name)}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {asI18n(`v${item.version}`)}
            </Badge>
            {installedNames.has(item.name) && (
              <Badge size="sm" variant="light" color="green">
                {t('packages.installed')}
              </Badge>
            )}
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
    key: 'functions',
    header: 'FUNCTIONS',
    render: (item: PackageMeta) => (
      <Text size="sm">{asI18n(String(Object.keys(item.functions ?? {}).length))}</Text>
    ),
  },
  {
    key: 'agents',
    header: 'AGENTS',
    render: (item: PackageMeta) => (
      <Text size="sm">{asI18n(String(Object.keys(item.agents ?? {}).length))}</Text>
    ),
  },
]

const INSTALLED_COLUMNS = () => [
  {
    key: 'addon',
    header: 'ADDON',
    render: (item: InstalledAddon) => (
      <Group gap="sm" wrap="nowrap">
        <PackageIcon icon={item.icon} name={item.namespace} />
        <div>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">
              {asI18n(item.namespace)}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {asI18n(item.packageName)}
            </Badge>
          </Group>
          {(item.tags ?? []).length > 0 && (
            <Group gap={4} mt={2}>
              {item.tags!.map((tag) => (
                <Badge key={tag} size="sm" variant="dot">
                  {asI18n(tag)}
                </Badge>
              ))}
            </Group>
          )}
        </div>
      </Group>
    ),
  },
  {
    key: 'functions',
    header: 'FUNCTIONS',
    render: (item: InstalledAddon) => (
      <Text size="sm">{asI18n(String(item.functionCount))}</Text>
    ),
  },
  {
    key: 'agents',
    header: 'AGENTS',
    render: (item: InstalledAddon) => <Text size="sm">{asI18n(String(item.agentCount))}</Text>,
  },
]

const InstalledList: React.FC<{
  searchQuery: string
  onSelect: (id: string, source: 'installed' | 'community') => void
  emptyHero?: React.ReactNode
}> = ({ searchQuery, onSelect, emptyHero }) => {
  const rpc = usePikkuRPC()
  const { t } = useI18n()

  const { data, isLoading } = useQuery({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddon[]
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const filtered = useMemo(() => {
    if (!searchQuery) return data ?? []
    const q = searchQuery.toLowerCase()
    return (data ?? []).filter(
      (item) =>
        item.namespace.toLowerCase().includes(q) ||
        item.packageName.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  const columns = useMemo(() => INSTALLED_COLUMNS(), [])

  return (
    <TableListPage
      title="Installed Addons"
      icon={Package}
      docsHref="https://pikku.dev/docs/external-packages"
      data={filtered}
      columns={columns}
      getKey={(item) => item.namespace}
      onRowClick={(item) => onSelect(item.packageName, 'installed')}
      emptyMessage={t('packages.installed_empty_message')}
      loading={isLoading}
      emptyHero={emptyHero}
    />
  )
}

const CommunityList: React.FC<{
  searchQuery: string
  onSelect: (id: string, source: 'installed' | 'community') => void
}> = ({ searchQuery, onSelect }) => {
  const rpc = usePikkuRPC()
  const { t } = useI18n()

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

  const installedNames = useMemo(
    () => new Set((installedAddons ?? []).map((a) => a.packageName)),
    [installedAddons]
  )

  const filtered = useMemo(() => {
    if (!searchQuery) return data ?? []
    const q = searchQuery.toLowerCase()
    return (data ?? []).filter(
      (item) =>
        item.displayName?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  const columns = useMemo(
    () => COMMUNITY_COLUMNS(installedNames, t),
    [installedNames, t]
  )

  return (
    <TableListPage
      title="Community Addons"
      icon={Package}
      docsHref="https://pikku.dev/docs/external-packages"
      data={filtered}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => onSelect(item.id, 'community')}
      emptyTitle={t('packages.registry_unavailable_title')}
      emptyDescription={t('packages.registry_unavailable_description')}
      loading={isLoading}
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
    render: (item: OpenApiEntry) => <Text size="sm">{asI18n(item.provider)}</Text>,
  },
  {
    key: 'operations',
    header: 'OPS',
    render: (item: any) => <Text size="sm">{asI18n(String(item.totalOperations ?? '-'))}</Text>,
  },
]

const ApisList: React.FC<{
  searchQuery: string
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ searchQuery, onSelect }) => {
  const rpc = usePikkuRPC()
  const { t } = useI18n()

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
      emptyTitle={t('packages.no_apis_title')}
      emptyDescription={t('packages.no_apis_description')}
      loading={isLoading}
    />
  )
}

const ADDON_TABS = [
  { value: 'installed', label: 'Installed' },
  { value: 'community', label: 'Community' },
  { value: 'apis', label: 'APIs' },
]

const SEARCH_PLACEHOLDER: Record<string, string> = {
  installed: 'packages.search_installed_placeholder',
  community: 'packages.search_community_placeholder',
  apis: 'packages.search_apis_placeholder',
}

const PackagesList: React.FC<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
  emptyHero?: React.ReactNode
}> = ({ onSelect, emptyHero }) => {
  const [tab, setTab] = useState<string>('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const { t } = useI18n()

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setTab(value)
  }

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={t('packages.title')}
          description={t('packages.description')}
          docsHref="https://pikku.dev/docs/external-packages"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={t(SEARCH_PLACEHOLDER[tab])}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              <SegmentedControl
                size="xs"
                value={tab}
                onChange={handleTabChange}
                data={ADDON_TABS}
              />
            </Group>
          }
        />
      }
    >
      {tab === 'installed' ? (
        <InstalledList searchQuery={searchQuery} onSelect={onSelect} emptyHero={emptyHero} />
      ) : tab === 'apis' ? (
        <ApisList searchQuery={searchQuery} onSelect={onSelect} />
      ) : (
        <CommunityList searchQuery={searchQuery} onSelect={onSelect} />
      )}
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
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
      emptyHero={emptyHero}
    />
  )
}

export const PackagesPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  return (
    <PanelProvider>
      <PackagesPageContent emptyHero={emptyHero} />
    </PanelProvider>
  )
}
