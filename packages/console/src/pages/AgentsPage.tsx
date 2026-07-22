import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Bot, Search } from 'lucide-react'
import { useNavigate } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EntityCardList } from '../components/layout/EntityCardList'
import type { EntityCardItem } from '../components/layout/EntityCardList'
import { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface AgentExtraColumn {
  label: string
  width?: string
  render: (name: string) => React.ReactNode
}

export const AgentsPage: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
}> = ({ onOpen, headerRight, emptyHero, metricSlot }) => {
  const navigate = useNavigate()
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const [searchQuery, setSearchQuery] = useState('')

  const allItems = useMemo((): EntityCardItem[] => {
    if (!meta.agentsMeta) return []
    return Object.entries(meta.agentsMeta)
      .map(([name, data]: [string, any]): EntityCardItem => {
        const toolCount = (data.tools ?? []).length
        const agentCount = (data.agents ?? []).length
        const badges = data.model
          ? [{ label: data.model, tone: 'neutral' as const }]
          : []
        const metaTags: string[] = []
        if (toolCount > 0)
          metaTags.push(`${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`)
        if (agentCount > 0)
          metaTags.push(
            `${agentCount} ${agentCount === 1 ? 'sub-agent' : 'sub-agents'}`
          )
        return {
          name,
          badges,
          meta: metaTags,
          description: data.summary ?? data.description,
          tags: data.tags,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.agentsMeta])

  const items = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.badges?.some((b) => b.label.toLowerCase().includes(q))
    )
  }, [allItems, searchQuery])

  const handleOpen = (name: string) => {
    if (onOpen) {
      onOpen(name)
    } else {
      navigate(`/agents/playground?id=${encodeURIComponent(name)}`)
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={m.agents_title()}
            description={m.agents_description()}
            docsHref="https://pikku.dev/docs/wiring/ai-agents"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={m.agents_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                {headerRight}
              </Group>
            }
          />
        }
      >
        <EntityCardList
          items={items}
          onOpen={handleOpen}
          loading={loading}
          icon={Bot}
          emptyHero={emptyHero}
          emptyTitle={m.agents_empty_title()}
          emptyDescription={m.agents_empty_description()}
          docsHref="https://pikku.dev/docs/wiring/ai-agents"
          metricSlot={metricSlot}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
