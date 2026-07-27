import React from 'react'
import type { I18nNode } from '@pikku/react'
import { PanelContainer } from '../panel/PanelContainer'

export interface WorkflowInspectorPanelProps {
  emptyMessage?: I18nNode
  /**
   * Draw workflow panels with their flow laid out vertically. Leave false when
   * a graph panel is already on screen — the flow would be drawn twice.
   */
  workflowGraph?: boolean
  /** Hide the per-panel close (X), for layouts that own the collapse control. */
  hideClose?: boolean
  /**
   * Drop the header on the top-level panel, for layouts that already name the
   * workflow elsewhere. Drilled-in panels keep their header and back button.
   */
  hideRootTitle?: boolean
}

/**
 * The detail inspector for whatever is currently selected — a step, a wire, the
 * workflow itself. Mount anywhere under a `WorkflowSurface`.
 *
 * Defaults suit sitting next to a graph panel; a host showing the inspector on
 * its own should pass `workflowGraph`.
 */
export const WorkflowInspectorPanel: React.FC<WorkflowInspectorPanelProps> = ({
  emptyMessage,
  workflowGraph = false,
  hideClose = true,
  hideRootTitle = false,
}) => {
  return (
    <PanelContainer
      emptyMessage={emptyMessage}
      workflowGraph={workflowGraph}
      hideClose={hideClose}
      hideRootTitle={hideRootTitle}
    />
  )
}
