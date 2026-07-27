import React from 'react'
import type { ReactNode } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { useNavigate } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { AgentListPanel } from '../components/agents/AgentListPanel'
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
  const [searchQuery, setSearchQuery] = useState('')

  const handleOpen = (name: string) => {
    if (onOpen) {
      onOpen(name)
    } else {
      navigate(`/agents/playground?id=${encodeURIComponent(name)}`)
    }
  }

  return (
    <ConsoleSurface>
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
        <AgentListPanel
          onOpen={handleOpen}
          searchQuery={searchQuery}
          emptyHero={emptyHero}
          metricSlot={metricSlot}
        />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
