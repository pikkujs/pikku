import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Cpu } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export const McpTab: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const { openMCP } = usePanelContext()

  const items = useMemo(() => {
    if (!meta.mcpMeta) return []
    return [...meta.mcpMeta].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [meta.mcpMeta])

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
      data={items}
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
