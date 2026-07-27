import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { PanelProvider } from '../../context/PanelContext'
import { WorkflowProvider } from '../../context/WorkflowContext'
import { WorkflowRunProvider } from '../../context/WorkflowRunContext'
import { CanvasDrawerProvider } from '../../context/DrawerContext'
import {
  WorkflowSurfaceCtx,
  type WorkflowSurfaceContextType,
} from '../../context/WorkflowSurfaceContext'
import { workflowQueryKeys } from '../../hooks/workflow-query-keys'
import { WorkflowFocusSync } from './WorkflowFocusSync'

export interface WorkflowSurfaceProps {
  children: React.ReactNode
  /**
   * The workflow (or scenario) to load. Ignored when `workflow` is supplied.
   */
  workflowId?: string | null
  /**
   * An already-resolved graph. Skips the fetch — for hosts that hold the meta
   * themselves, such as a canvas spanning every wire type.
   */
  workflow?: any
  /**
   * Viewer only: no WorkflowRunProvider, so the panels show no run controls.
   * Scenarios use this — they can only be run via `pikku scenario run`, since
   * actor sign-in cookies can't be minted in the browser.
   */
  readOnly?: boolean
}

/**
 * Mounts every context the workflow panels read from, so each panel can be
 * placed anywhere in the tree, in any order, by whoever is composing them.
 *
 * Deliberately owns only the workflow-scoped contexts — the router, meta, RPC,
 * navigator and editable providers are assumed ambient, because an embedding
 * app supplies its own.
 */
export const WorkflowSurface: React.FC<WorkflowSurfaceProps> = ({
  children,
  workflowId = null,
  workflow: providedWorkflow,
  readOnly = false,
}) => {
  const rpc = usePikkuRPC()

  const { data: fetchedWorkflow, isLoading } = useQuery({
    queryKey: workflowQueryKeys.meta(workflowId),
    queryFn: () =>
      rpc.invoke('console:getWorkflowMetaById', { workflowId: workflowId! }),
    enabled: !!workflowId && !providedWorkflow,
  })

  const workflow = providedWorkflow ?? fetchedWorkflow

  const value = useMemo((): WorkflowSurfaceContextType => {
    const source = workflow?.source || 'graph'
    const workflowName = workflow?.name || workflow?.wireId || 'Workflow'
    return {
      workflow,
      workflowName,
      runsWorkflowName: workflowId ?? workflowName,
      workflowId,
      loading: !providedWorkflow && !!workflowId && isLoading,
      readOnly,
      isScenario: source === 'scenario',
      isComplex: source === 'complex',
    }
  }, [workflow, workflowId, providedWorkflow, isLoading, readOnly])

  const inner = (
    <WorkflowProvider workflow={workflow}>
      <CanvasDrawerProvider>
        <WorkflowFocusSync />
        {children}
      </CanvasDrawerProvider>
    </WorkflowProvider>
  )

  return (
    <WorkflowSurfaceCtx.Provider value={value}>
      <PanelProvider>
        {readOnly ? (
          inner
        ) : (
          <WorkflowRunProvider
            workflowName={value.runsWorkflowName}
            currentGraphHash={workflow?.graphHash}
            workflowNodes={workflow?.nodes}
          >
            {inner}
          </WorkflowRunProvider>
        )}
      </PanelProvider>
    </WorkflowSurfaceCtx.Provider>
  )
}
