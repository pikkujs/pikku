import { createContext, useContext } from 'react'

/**
 * What every workflow panel needs to know about the workflow it is showing.
 *
 * The panels read this instead of taking the graph as a prop, which is what
 * lets a host arrange them freely — a runs list, a canvas and an inspector can
 * sit anywhere in the tree, in any order, as long as one `WorkflowSurface` is
 * above them.
 */
export interface WorkflowSurfaceContextType {
  /** The graph, or undefined while loading / when the id resolves to nothing. */
  workflow: any | undefined
  /**
   * Display name, and the key panel ids are built from. Falls back to the wire
   * id. Deliberately *not* the same value as {@link runsWorkflowName}.
   */
  workflowName: string
  /**
   * The name run queries are keyed by. Prefers the id the surface was asked to
   * load, because that is what `console:getWorkflowRuns` matches on — a graph
   * whose `name` differs from its id would otherwise return no runs.
   */
  runsWorkflowName: string
  /** The id the surface was asked to load, if it was given one. */
  workflowId: string | null
  loading: boolean
  /** No run controls: mounted without a WorkflowRunProvider. */
  readOnly: boolean
  /** Scenarios render as a persona timeline rather than a node graph. */
  isScenario: boolean
  /** Code-defined workflow whose visual graph is best-effort. */
  isComplex: boolean
}

export const WorkflowSurfaceCtx = createContext<
  WorkflowSurfaceContextType | undefined
>(undefined)

export const useWorkflowSurface = (): WorkflowSurfaceContextType => {
  const context = useContext(WorkflowSurfaceCtx)
  if (!context) {
    throw new Error('useWorkflowSurface must be used within a WorkflowSurface')
  }
  return context
}

export const useWorkflowSurfaceSafe = () => useContext(WorkflowSurfaceCtx)
