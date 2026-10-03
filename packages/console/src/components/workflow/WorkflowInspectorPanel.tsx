import React from 'react'
import {
  ConsoleInspectorPanel,
  type ConsoleInspectorPanelProps,
} from '../console/ConsoleInspectorPanel'

export type WorkflowInspectorPanelProps = ConsoleInspectorPanelProps

/**
 * {@link ConsoleInspectorPanel} with the defaults a workflow layout wants: no
 * per-panel close (the three-pane layout owns the collapse control) and no
 * duplicate flow drawing, because a graph panel is already on screen.
 *
 * A host showing the inspector on its own should pass `workflowGraph`.
 */
export const WorkflowInspectorPanel: React.FC<WorkflowInspectorPanelProps> = ({
  emptyMessage,
  workflowGraph = false,
  hideClose = true,
  hideRootTitle = false,
}) => {
  return (
    <ConsoleInspectorPanel
      emptyMessage={emptyMessage}
      workflowGraph={workflowGraph}
      hideClose={hideClose}
      hideRootTitle={hideRootTitle}
    />
  )
}
