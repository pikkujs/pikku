import React, { useMemo, useState } from 'react'
import { useSearchParams } from '../router'
import { PackageDetailPage } from './PackageDetailPage'
import { Group, Text, ThemeIcon, Badge, Box, Loader, Center } from '@mantine/core'
import { Package, Globe } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '../components/layout/TabbedPageHeader'
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

const PackageIcon: React.FunctionComponent<{ icon?: string; name: string }> = ({
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

const COMMUNITY_COLUMNS = (installedNames: Set<string>) => [
  {
    key: 'package',
    header: 'PACKAGE',
    render: (item: PackageMeta) => (
      <Group gap="sm" wrap="nowrap">
        <PackageIcon icon={item.icon} name={item.displayName} />
        <div>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">
              {item.displayName || item.name}
            </Text>
            <Badge size="xs" variant="light" color="gray">
              v{item.version}
            </Badge>
            {installedNames.has(item.name) && (
              <Badge size="xs" variant="light" color="green">
                Installed
              </Badge>
            )}
          </Group>
          {item.description && (
            <Text size="xs" c="dimmed" truncate style={{ maxWidth: 400 }}>
              {item.description}
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
      <Text size="sm">{Object.keys(item.functions ?? {}).length}</Text>
    ),
  },
  {
    key: 'agents',
    header: 'AGENTS',
    render: (item: PackageMeta) => (
      <Text size="sm">{Object.keys(item.agents ?? {}).length}</Text>
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
              {item.namespace}
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {item.packageName}
            </Badge>
          </Group>
          {(item.tags ?? []).length > 0 && (
            <Group gap={4} mt={2}>
              {item.tags!.map((tag) => (
                <Badge key={tag} size="xs" variant="dot">
                  {tag}
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
      <Text size="sm">{item.functionCount}</Text>
    ),
  },
  {
    key: 'agents',
    header: 'AGENTS',
    render: (item: InstalledAddon) => (
      <Text size="sm">{item.agentCount}</Text>
    ),
  },
]

const InstalledList: React.FunctionComponent<{
  onSelect: (id: string, source: 'installed' | 'community') => void
}> = ({ onSelect }) => {
  const rpc = usePikkuRPC()

  const { data, isLoading } = useQuery({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons', null)
      return (result ?? []) as InstalledAddon[]
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const columns = useMemo(() => INSTALLED_COLUMNS(), [])

  return (
    <TableListPage
      title="Installed Addons"
      icon={Package}
      docsHref="https://pikku.dev/docs/external-packages"
      data={data ?? []}
      columns={columns}
      getKey={(item) => item.namespace}
      onRowClick={(item) => onSelect(item.packageName, 'installed')}
      searchPlaceholder="Search installed addons..."
      searchFilter={(item, q) =>
        item.namespace.toLowerCase().includes(q) ||
        item.packageName.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No installed addons found."
      loading={isLoading}
    />
  )
}

const CommunityList: React.FunctionComponent<{
  onSelect: (id: string, source: 'installed' | 'community') => void
}> = ({ onSelect }) => {
  const rpc = usePikkuRPC()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getAddonMeta', null)
      return ((result as any)?.packages ?? result ?? []) as PackageMeta[]
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: installedAddons } = useQuery<Array<{ packageName: string }>>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons', null)
      return (result ?? []) as Array<{ packageName: string }>
    },
    staleTime: 60 * 1000,
  })

  const installedNames = useMemo(
    () => new Set((installedAddons ?? []).map((a) => a.packageName)),
    [installedAddons]
  )

  const columns = useMemo(() => COMMUNITY_COLUMNS(installedNames), [installedNames])

  return (
    <TableListPage
      title="Community Addons"
      icon={Package}
      docsHref="https://pikku.dev/docs/external-packages"
      data={data ?? []}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => onSelect(item.id, 'community')}
      searchPlaceholder="Search community addons..."
      searchFilter={(item, q) =>
        item.displayName?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        false
      }
      emptyTitle="Registry Unavailable"
      emptyDescription="Could not fetch addons from the registry. Check your network connection."
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
              {item.title || item.name}
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {item.openapiVer}
            </Badge>
          </Group>
          {item.description && (
            <Text size="xs" c="dimmed" truncate style={{ maxWidth: 400 }}>
              {item.description}
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
      <Text size="sm">{item.provider}</Text>
    ),
  },
  {
    key: 'operations',
    header: 'OPS',
    render: (item: any) => (
      <Text size="sm">{item.totalOperations ?? '-'}</Text>
    ),
  },
]

const ApisList: React.FunctionComponent<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ onSelect }) => {
  const rpc = usePikkuRPC()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['openapis', search],
    queryFn: async () => {
      const result = await rpc.invoke('console:getOpenapis', {
        limit: 100,
        offset: 0,
        search: search || undefined,
      })
      return result as { apis: OpenApiEntry[]; total: number }
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  return (
    <TableListPage
      title={`APIs (${data?.total ?? '...'})`}
      icon={Globe}
      docsHref="https://pikku.dev/docs/external-packages"
      data={data?.apis ?? []}
      columns={API_COLUMNS}
      getKey={(item) => item.name}
      onRowClick={(item) => onSelect(item.name, 'api' as any)}
      searchPlaceholder="Search APIs..."
      searchFilter={(item, q) =>
        item.title?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        item.provider?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        false
      }
      emptyTitle="No APIs Found"
      emptyDescription="Could not fetch APIs from the registry."
      loading={isLoading}
    />
  )
}

const ADDON_TABS = [
  { value: 'installed', label: 'Installed' },
  { value: 'community', label: 'Community' },
  { value: 'apis', label: 'APIs' },
]

const PackagesList: React.FunctionComponent<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ onSelect }) => {
  const [tab, setTab] = useState<string>('installed')

  return (
    <ResizablePanelLayout
      header={
        <TabbedPageHeader
          icon={Package}
          category="Addons"
          docsHref="https://pikku.dev/docs/external-packages"
          tabs={ADDON_TABS}
          activeTab={tab}
          onTabChange={setTab}
        />
      }
      hidePanel
    >
      {tab === 'installed' ? (
        <InstalledList onSelect={onSelect} />
      ) : tab === 'apis' ? (
        <ApisList onSelect={onSelect} />
      ) : (
        <CommunityList onSelect={onSelect} />
      )}
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FunctionComponent = () => {
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

export const PackagesPage: React.FunctionComponent = () => {
  return (
    <PanelProvider>
      <PackagesPageContent />
    </PanelProvider>
  )
}
