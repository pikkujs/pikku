import React, { useState, useMemo } from 'react'
import { Text } from '@mantine/core'
import { Cpu } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider } from '@/context/PanelContext'
import { usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

const MCP_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'resource', label: 'Resources' },
  { value: 'tool', label: 'Tools' },
  { value: 'prompt', label: 'Prompts' },
]

const McpTable: React.FunctionComponent<{
  items: any[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openMCP } = usePanelContext()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => item.method === filter)
  }, [items, filter])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: any) => (
          <>
            <Text fw={500} truncate>
              {item.name || item.wireId || 'unnamed'}
            </Text>
            {item.pikkuFuncId && (
              <Text size="xs" c="dimmed" truncate>
                {item.pikkuFuncId}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'method',
        header: 'TYPE',
        align: 'right' as const,
        render: (item: any) => {
          const method = item.method || 'tool'
          return <PikkuBadge type="mcpType" value={method} />
        },
      },
    ],
    []
  )

  return (
    <TableListPage
      title="MCP"
      icon={Cpu}
      docsHref="https://pikku.dev/docs/wiring/mcp"
      data={filtered}
      columns={columns}
      getKey={(item) => `${item.method}::${item.wireId || item.name}`}
      onRowClick={(item) =>
        openMCP(`mcp::${item.method}::${item.wireId || item.name}`, item)
      }
      searchPlaceholder="Search MCP tools, resources, prompts..."
      searchFilter={(item, q) =>
        item.name?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q) ||
        item.method?.toLowerCase().includes(q)
      }
      emptyMessage="No MCP entries found."
      loading={loading}
    />
  )
}

export const McpPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo(() => {
    if (!meta.mcpMeta) return []
    return [...meta.mcpMeta].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [meta.mcpMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Cpu}
            category="MCP"
            docsHref="https://pikku.dev/docs/wiring/mcp"
          />
        }
        showTabs={false}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage="Select an MCP entry to view its details"
      >
        <McpTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
