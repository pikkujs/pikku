import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useAgentEntries } from '../../hooks/useAgentEntries'
import { EntityCardList } from '../layout/EntityCardList'

export interface AgentListPanelProps {
  onOpen: (name: string) => void
  /** Filters by name, description and badge label. Omit for the full list. */
  searchQuery?: string
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

/**
 * Every AI agent in the project as selectable cards.
 *
 * Reads the project meta itself, so a host can mount it anywhere without
 * threading the agent list through props.
 */
export const AgentListPanel: React.FC<AgentListPanelProps> = ({
  onOpen,
  searchQuery = '',
  emptyHero,
  metricSlot,
  icon = Bot,
}) => {
  const { agents, loading } = useAgentEntries()

  const items = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return agents
    return agents.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.badges?.some((b) => b.label.toLowerCase().includes(q))
    )
  }, [agents, searchQuery])

  return (
    <EntityCardList
      items={items}
      onOpen={onOpen}
      loading={loading}
      icon={icon}
      emptyHero={emptyHero}
      emptyTitle={m.agents_empty_title()}
      emptyDescription={m.agents_empty_description()}
      docsHref="https://pikku.dev/docs/wiring/agents"
      metricSlot={metricSlot}
    />
  )
}
