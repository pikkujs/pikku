import React, { useMemo } from 'react'
import { ConsoleSurface } from '../console/ConsoleSurface'
import { AgentPlaygroundProvider } from '../../context/AgentPlaygroundContext'
import {
  AgentPlaygroundSurfaceCtx,
  type AgentPlaygroundSurfaceContextType,
  type AgentPlaygroundSurfaceItem,
} from '../../context/AgentPlaygroundSurfaceContext'
import { AgentFocusSync } from './AgentFocusSync'

export interface AgentPlaygroundSurfaceProps {
  children: React.ReactNode
  agentId: string
  /** The agent's meta. Drives what the inspector shows. */
  agentData?: any
  /** Agents the selector may switch to. Omit to pin the surface to one agent. */
  agentItems?: AgentPlaygroundSurfaceItem[]
  onAgentSelect?: (name: string) => void
}

/**
 * Mounts every context the agent playground panels read from, so each panel can
 * be placed anywhere in the tree, in any order, by whoever is composing them.
 *
 * Deliberately owns only the agent-scoped contexts plus the panel context — the
 * router, meta and RPC providers are assumed ambient, because an embedding app
 * supplies its own.
 */
export const AgentPlaygroundSurface: React.FC<AgentPlaygroundSurfaceProps> = ({
  children,
  agentId,
  agentData,
  agentItems = [],
  onAgentSelect,
}) => {
  const value = useMemo(
    (): AgentPlaygroundSurfaceContextType => ({
      agentId,
      agentData,
      agentItems,
      onAgentSelect,
    }),
    [agentId, agentData, agentItems, onAgentSelect]
  )

  return (
    <AgentPlaygroundSurfaceCtx.Provider value={value}>
      <ConsoleSurface>
        <AgentPlaygroundProvider agentId={agentId}>
          <AgentFocusSync />
          {children}
        </AgentPlaygroundProvider>
      </ConsoleSurface>
    </AgentPlaygroundSurfaceCtx.Provider>
  )
}
