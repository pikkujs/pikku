import React from 'react'
import type { I18nNode } from '@pikku/react'
import { PanelContainer } from '../panel/PanelContainer'

export interface ConsoleInspectorPanelProps {
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
   * entity elsewhere. Drilled-in panels keep their header and back button.
   */
  hideRootTitle?: boolean
}

/**
 * The detail inspector for whatever is currently selected — a queue, a function,
 * a workflow step, a secret. Mount anywhere under a {@link ConsoleSurface}.
 *
 * Entity-agnostic by construction: it renders whichever panel the panel context
 * has made active, and `PanelFactory` decides the contents from the panel's
 * type. A host needs one of these no matter which list panel it pairs it with.
 */
export const ConsoleInspectorPanel: React.FC<ConsoleInspectorPanelProps> = ({
  emptyMessage,
  workflowGraph = false,
  hideClose = false,
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
