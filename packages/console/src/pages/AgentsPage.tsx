import React, { useMemo } from 'react'
import { useNavigate } from '../router'
import { Text, Center, Loader } from '@mantine/core'
import { Bot } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'

export interface AgentExtraColumn {
  label: string
  width?: string
  render: (name: string) => React.ReactNode
}

interface AgentItem {
  name: string
  model?: string
  toolCount: number
  agentCount: number
  data: any
}

export const AgentsPage: React.FC<{
  extraColumns?: AgentExtraColumn[]
  headerRight?: React.ReactNode
}> = ({ extraColumns, headerRight }) => {
  const navigate = useNavigate()
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): AgentItem[] => {
    if (!meta.agentsMeta) return []
    return Object.entries(meta.agentsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        model: data.model,
        toolCount: (data.tools || []).length,
        agentCount: (data.agents || []).length,
        data,
      })
    )
  }, [meta.agentsMeta])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: AgentItem) => (
          <>
            <Text fw={500} truncate>
              {item.name}
            </Text>
            {item.data?.summary && (
              <Text size="xs" c="dimmed" truncate>
                {item.data.summary}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'model',
        header: 'MODEL',
        render: (item: AgentItem) =>
          item.model ? (
            <PikkuBadge type="dynamic" badge="model" value={item.model} />
          ) : null,
      },
      {
        key: 'tools',
        header: 'TOOLS',
        render: (item: AgentItem) =>
          item.toolCount > 0 ? (
            <PikkuBadge type="dynamic" badge="tools" value={item.toolCount} />
          ) : null,
      },
      {
        key: 'agents',
        header: 'AGENTS',
        render: (item: AgentItem) =>
          item.agentCount > 0 ? (
            <PikkuBadge type="dynamic" badge="agents" value={item.agentCount} />
          ) : null,
      },
      ...(extraColumns ?? []).map((col, i) => ({
        key: `extra-${i}`,
        header: col.label.toUpperCase(),
        width: col.width,
        render: (item: AgentItem) => col.render(item.name),
      })),
    ],
    [extraColumns]
  )

  return (
    <PanelProvider>
      <ResizablePanelLayout hidePanel header={<ListPageHeader title="Agents" description="AI agents and their configurations" />}>
        <TableListPage
          title="Agents"
          icon={Bot}
          docsHref="https://pikku.dev/docs/wiring/ai-agents"
          data={items}
          columns={columns}
          getKey={(item) => item.name}
          onRowClick={(item) =>
            navigate(`/agents/playground?id=${encodeURIComponent(item.name)}`)
          }
          searchPlaceholder="Search agents..."
          searchFilter={(item, q) =>
            item.name.toLowerCase().includes(q) ||
            item.model?.toLowerCase().includes(q) ||
            item.data?.summary?.toLowerCase().includes(q) ||
            false
          }
          emptyMessage="No agents found."
          loading={loading}
          headerRight={headerRight ?? null}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
