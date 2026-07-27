import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import type { AgentPlaygroundSurfaceItem } from '../context/AgentPlaygroundSurfaceContext'

/**
 * Every agent in the project, as the entries an agent selector lists.
 */
export const useAgentItems = (): AgentPlaygroundSurfaceItem[] => {
  const { meta } = usePikkuMeta()

  return useMemo(() => {
    if (!meta.agentsMeta) return []
    return Object.entries(meta.agentsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        description: data?.summary,
      })
    )
  }, [meta.agentsMeta])
}
