import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { GitBranch } from 'lucide-react'
import { m } from '@/i18n/messages'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { EntityCardList } from '../layout/EntityCardList'
import type { EntityCardItem, EntityCardBadge } from '../layout/EntityCardList'

export interface WorkflowListPanelProps {
  onOpen: (name: string) => void
  /** Filters by name and description. Omit for the unfiltered list. */
  searchQuery?: string
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

/**
 * Every workflow in the project as selectable cards — scenarios left out (they
 * have their own surface).
 *
 * Reads the project meta rather than a `WorkflowSurface`: this is the panel a
 * host shows *before* one workflow has been chosen.
 */
export const WorkflowListPanel: React.FC<WorkflowListPanelProps> = ({
  onOpen,
  searchQuery = '',
  emptyHero,
  metricSlot,
  icon = GitBranch,
}) => {
  const { meta, loading } = usePikkuMeta()

  const scenarioNames = useMemo(() => {
    const names = new Set<string>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      if (w.source === 'scenario' || w.scenario === true) names.add(w.name)
    }
    return names
  }, [meta.workflows])

  const allItems = useMemo((): EntityCardItem[] => {
    const workflows = meta.workflows ?? {}
    const all = Object.values(workflows) as any[]
    return all
      .map((w: any): EntityCardItem => {
        const stepCount = w.nodes
          ? Object.keys(w.nodes).length
          : (w.steps?.length ?? 0)
        const badges: EntityCardBadge[] = []
        if (w.source === 'scenario')
          badges.push({ label: 'Scenario', tone: 'accent' as const })
        else if (w.dsl === true)
          badges.push({ label: 'DSL', tone: 'neutral' as const })
        const metaTags: string[] = []
        if (stepCount > 0)
          metaTags.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`)
        if (w.actors?.length) metaTags.push(w.actors.join(', '))
        return {
          name: w.name,
          badges,
          meta: metaTags,
          description: w.description ?? w.summary,
          tags: w.tags,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.workflows])

  const items = useMemo(() => {
    const base = allItems.filter((item) => !scenarioNames.has(item.name))
    const q = searchQuery.toLowerCase()
    if (!q) return base
    return base.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [allItems, scenarioNames, searchQuery])

  return (
    <EntityCardList
      items={items}
      onOpen={onOpen}
      loading={loading}
      icon={icon}
      emptyHero={emptyHero}
      emptyTitle={m.workflows_empty_title()}
      emptyDescription={m.workflows_empty_description()}
      docsHref="https://pikku.dev/docs/wiring/workflows"
      metricSlot={metricSlot}
    />
  )
}
