import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PackageDetailPage } from './PackageDetailPage'
import { Group, Text, ThemeIcon, Badge } from '@mantine/core'
import { Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PanelProvider } from '@/context/PanelContext'

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

const PackageIcon: React.FunctionComponent<{ icon?: string; name: string }> = ({ icon, name }) => {
  if (icon) {
    const src = icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`
      : icon
    return (
      <img src={src} width={28} height={28} alt={name} style={{ objectFit: 'contain', display: 'block', borderRadius: 4 }} />
    )
  }
  return (
    <ThemeIcon size={28} radius="sm" variant="light" color="blue">
      <Package size={16} />
    </ThemeIcon>
  )
}

const COLUMNS = () => [
  {
    key: 'package',
    header: 'PACKAGE',
    render: (item: PackageMeta) => (
      <Group gap="sm" wrap="nowrap">
        <PackageIcon icon={item.icon} name={item.displayName} />
        <div>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">{item.displayName || item.name}</Text>
            <Badge size="xs" variant="light" color="gray">v{item.version}</Badge>
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

const PackagesList: React.FunctionComponent<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const rpc = usePikkuRPC()

  const { data, isLoading } = useQuery({
    queryKey: ['external-packages'],
    queryFn: async () => {
      const result = await rpc('console:getExternalMeta', null)
      return ((result as any)?.packages ?? result ?? []) as PackageMeta[]
    },
    staleTime: 60 * 1000,
  })

  const columns = useMemo(() => COLUMNS(), [])

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Package}
          category="Packages"
          docsHref="https://pikkujs.com/docs/packages"
        />
      }
      hidePanel
    >
      <TableListPage
        title="Packages"
        icon={Package}
        docsHref="https://pikkujs.com/docs/packages"
        data={data ?? []}
        columns={columns}
        getKey={(item) => item.id}
        onRowClick={(item) => onSelect(item.id)}
        searchPlaceholder="Search packages..."
        searchFilter={(item, q) =>
          item.displayName?.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          false
        }
        emptyMessage="No packages found in registry."
        loading={isLoading}
      />
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')

  if (selectedId) {
    return <PackageDetailPage id={selectedId} onBack={() => setSearchParams({})} />
  }

  return <PackagesList onSelect={(id) => setSearchParams({ id })} />
}

export const PackagesPage: React.FunctionComponent = () => {
  return (
    <PanelProvider>
      <PackagesPageContent />
    </PanelProvider>
  )
}
