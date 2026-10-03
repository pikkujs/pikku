import React, { useEffect } from 'react'
import { usePanelContext } from '../../context/PanelContext'
import { useAgentPlaygroundSurface } from '../../context/AgentPlaygroundSurfaceContext'

/**
 * Keeps the inspector pointed at the surface's agent. Mounted by
 * `AgentPlaygroundSurface` so the selection follows the agent no matter which
 * panels a host chose to render.
 */
export const AgentFocusSync: React.FC = () => {
  const { agentId, agentData } = useAgentPlaygroundSurface()
  const { openAgent } = usePanelContext()

  useEffect(() => {
    if (agentData) {
      openAgent(agentId, agentData)
    }
  }, [agentId, agentData, openAgent])

  return null
}
