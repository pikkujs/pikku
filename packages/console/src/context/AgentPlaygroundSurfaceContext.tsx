import { createContext, useContext } from 'react'

export interface AgentPlaygroundSurfaceItem {
  name: string
  description?: string
}

/**
 * What every agent playground panel needs to know about the agent it is
 * showing.
 *
 * The panels read this instead of taking the agent as a prop, which is what
 * lets a host arrange them freely — the conversation list, the chat and the
 * inspector can sit anywhere in the tree, in any order, as long as one
 * `AgentPlaygroundSurface` is above them.
 */
export interface AgentPlaygroundSurfaceContextType {
  agentId: string
  /** The agent's meta, or undefined when the id resolves to nothing. */
  agentData: any | undefined
  /** Every agent that can be switched to. Empty when the host offers no switch. */
  agentItems: AgentPlaygroundSurfaceItem[]
  /** Omitted where the host pins the surface to a single agent. */
  onAgentSelect?: (name: string) => void
}

export const AgentPlaygroundSurfaceCtx = createContext<
  AgentPlaygroundSurfaceContextType | undefined
>(undefined)

export const useAgentPlaygroundSurface =
  (): AgentPlaygroundSurfaceContextType => {
    const context = useContext(AgentPlaygroundSurfaceCtx)
    if (!context) {
      throw new Error(
        'useAgentPlaygroundSurface must be used within an AgentPlaygroundSurface'
      )
    }
    return context
  }
