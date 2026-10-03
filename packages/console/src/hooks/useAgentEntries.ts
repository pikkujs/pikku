import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import type { EntityCardItem } from '../components/layout/EntityCardList'

export interface AgentEntries {
  agents: EntityCardItem[]
  loading: boolean
}

/**
 * Every AI agent in the project as card entries, sorted by name.
 *
 * Lives outside the page so a host arranging its own layout can derive the
 * same list without mounting `AgentsPage`.
 */
export function useAgentEntries(): AgentEntries {
  const { meta, loading } = usePikkuMeta()

  const agents = useMemo((): EntityCardItem[] => {
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

  return { agents, loading }
}
