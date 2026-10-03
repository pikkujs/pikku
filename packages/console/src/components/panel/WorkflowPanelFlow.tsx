import React from 'react'
import { Box } from '@pikku/mantine/core'
import { useWorkflowContext } from '../../context/WorkflowContext'
import { WorkflowGraphView } from '../project/WorkflowGraphView'

/** Vertical rendering of the workflow inside the (narrow) side panel.
 *  Suppressed (renderGraph=false) when the panel sits beside a full canvas
 *  that already draws the same graph. */
export const WorkflowPanelFlow: React.FC = () => {
  const { workflow } = useWorkflowContext()

  return (
    <Box h={560} style={{ minHeight: 0 }}>
      <WorkflowGraphView workflow={workflow} direction="DOWN" />
    </Box>
  )
}
