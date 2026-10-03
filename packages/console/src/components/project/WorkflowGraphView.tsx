import React, { useMemo } from 'react'
import {
  WorkflowGraphView as BaseWorkflowGraphView,
  type FlowDirection,
  type WorkflowGraphHost,
} from '@pikku/workflow-graph'
import { usePanelContext } from '../../context/PanelContext'
import { useWorkflowContextSafe } from '../../context/WorkflowContext'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'
import { useFunctionsMeta } from '../../hooks/useWirings'

export interface WorkflowGraphViewProps {
  workflow: any
  /** 'RIGHT' (default) lays the graph out left→right; 'DOWN' top→bottom —
   *  use 'DOWN' when embedding in a narrow container like a side panel. */
  direction?: FlowDirection
  onPaneClick?: () => void
}

/** Console binding for the standalone @pikku/workflow-graph renderer: hands it
 *  the panels a node click opens, the highlighted node, and the selected run. */
export const WorkflowGraphView: React.FC<WorkflowGraphViewProps> = (props) => {
  const { openFunction, openChannel, openWorkflowStep } = usePanelContext()
  const workflowContext = useWorkflowContextSafe()
  const runContext = useWorkflowRunContextSafe()
  const { data: functionsMeta } = useFunctionsMeta()

  const host: WorkflowGraphHost = useMemo(
    () => ({
      openFunction,
      openChannel,
      openWorkflowStep,
      focusedNodeId: workflowContext?.focusedNodeId ?? null,
      referencedNodeId: workflowContext?.referencedNodeId ?? null,
      getFunctionMeta: (name: string) =>
        functionsMeta?.find((f: any) => f.name === name) ?? null,
      run: runContext
        ? {
            runId: runContext.selectedRunId,
            stepStates: runContext.stepStates,
            status: runContext.runData?.status,
            wire: runContext.runData?.wire,
          }
        : null,
    }),
    [
      openFunction,
      openChannel,
      openWorkflowStep,
      workflowContext?.focusedNodeId,
      workflowContext?.referencedNodeId,
      functionsMeta,
      runContext?.selectedRunId,
      runContext?.stepStates,
      runContext?.runData,
    ]
  )

  return <BaseWorkflowGraphView {...props} host={host} />
}
