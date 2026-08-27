import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Cpu } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type McpTabProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const McpTab: React.FC<McpTabProps> = ({ searchQuery, emptyHero }) => {
  const { meta } = usePikkuMeta()
  useLocale()
  const { openMCP } = usePanelContext()

  const items = useMemo(() => {
    if (!meta.mcpMeta) return []
    return [...meta.mcpMeta].sort((a: any, b: any) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [meta.mcpMeta])

  usePanelUrl({
    type: 'mcp',
    items,
    getId: (item: any) => `mcp::${item.method}::${item.wireId || item.name}`,
    open: openMCP,
  })

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (item: any) => (
          <>
            <Text fw={500} truncate>
              {item.name || item.wireId || 'unnamed'}
            </Text>
            {item.pikkuFuncId && (
              <Text size="xs" ff="monospace" c="dimmed" truncate>
                {item.pikkuFuncId}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'type',
        header: 'Type',
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
      data={items}
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
      emptyHero={emptyHero}
      externalSearch={searchQuery}
    />
  )
}
