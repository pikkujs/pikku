import React, { useState, useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Cpu } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { useMcpItems } from '../../hooks/useMcpItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface McpListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every MCP resource, tool and prompt in the project as selectable rows. Mount
 * anywhere under a `ConsoleSurface` — it reads its own meta and opens the MCP
 * inspector.
 */
export const McpListPanel: React.FC<McpListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openMCP } = usePanelContext()
  useLocale()
  const { items, loading } = useMcpItems()
  const [filter] = useState('all')

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
      externalSearch={externalSearch}
      searchFilter={(item, q) =>
        item.name?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q) ||
        item.method?.toLowerCase().includes(q)
      }
      emptyMessage={m.mcp_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
