import React, { createContext, useContext } from 'react'

export type WorkflowStepStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'suspended' | 'cancelled'

export interface WorkflowGraphStepState {
  status?: WorkflowStepStatus | string
  [key: string]: unknown
}

export interface WorkflowGraphRun {
  /** Identifies the run whose state the nodes paint; null renders the graph unpainted. */
  runId: string | null
  stepStates: Map<string, WorkflowGraphStepState>
  status?: string
  /** The wire the run was triggered from; wiring nodes light up the matching one. */
  wire?: { type: string; id?: string }
}

export interface WorkflowGraphHost {
  openFunction?: (functionName: string, metadata?: any) => void
  openChannel?: (channelId: string, metadata?: any) => void
  openWorkflowStep?: (stepId: string, stepType: string, metadata?: any) => void
  focusedNodeId?: string | null
  referencedNodeId?: string | null
  getFunctionMeta?: (functionName: string) => any
  run?: WorkflowGraphRun | null
}

const GraphHostContext = createContext<WorkflowGraphHost>({})

export const GraphHostProvider: React.FC<{
  host: WorkflowGraphHost
  children: React.ReactNode
}> = ({ host, children }) => (
  <GraphHostContext.Provider value={host}>{children}</GraphHostContext.Provider>
)

export const useGraphHost = (): WorkflowGraphHost =>
  useContext(GraphHostContext)

const noop = () => {}

export const useGraphActions = () => {
  const host = useGraphHost()
  return {
    openFunction: host.openFunction ?? noop,
    openChannel: host.openChannel ?? noop,
    openWorkflowStep: host.openWorkflowStep ?? noop,
  }
}

export const useGraphHighlight = () => {
  const host = useGraphHost()
  if (host.focusedNodeId === undefined && host.referencedNodeId === undefined) {
    return null
  }
  return {
    focusedNodeId: host.focusedNodeId ?? null,
    referencedNodeId: host.referencedNodeId ?? null,
  }
}

export const useGraphRun = (): WorkflowGraphRun | null =>
  useGraphHost().run ?? null

export const useGraphFunctionMeta = (functionName: string) => {
  const host = useGraphHost()
  return { data: host.getFunctionMeta?.(functionName) ?? null }
}
