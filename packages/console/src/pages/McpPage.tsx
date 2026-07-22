import React, { useState, useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Cpu } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

const MCP_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'resource', label: 'Resources' },
  { value: 'tool', label: 'Tools' },
  { value: 'prompt', label: 'Prompts' },
]

const McpTable: React.FC<{
  items: any[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openMCP } = usePanelContext()
  useLocale()
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
              {asI18n(item.name || item.wireId || 'unnamed')}
            </Text>
            {item.pikkuFuncId && (
              <Text size="sm" c="dimmed" truncate>
                {asI18n(item.pikkuFuncId)}
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
      searchPlaceholder={m.mcp_search_placeholder()}
      searchFilter={(item, q) =>
        item.name?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q) ||
        item.method?.toLowerCase().includes(q)
      }
      emptyMessage={m.mcp_empty_message()}
      loading={loading}
    />
  )
}

export const McpPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  useLocale()

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
          <ListPageHeader
            title={m.mcp_title()}
            description={m.mcp_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.mcp_select_entry()}
      >
        <McpTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
