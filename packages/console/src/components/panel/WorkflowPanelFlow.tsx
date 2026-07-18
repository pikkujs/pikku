import React from 'react'
import { Box } from '@pikku/mantine/core'
import { useWorkflowContext } from '../../context/WorkflowContext'
import { WorkflowGraphView } from '../project/WorkflowGraphView'
import { PersonaTimeline } from '../flows/timeline/PersonaTimeline'

/** Vertical rendering of the workflow inside the (narrow) side panel: the
 *  scenario timeline for scenarios, the top→down graph for everything else.
 *  Suppressed (renderGraph=false) when the panel sits beside a full canvas
 *  that already draws the same graph. */
export const WorkflowPanelFlow: React.FC = () => {
  const { workflow } = useWorkflowContext()
  const isScenario =
    workflow?.source === 'scenario' || workflow?.scenario === true

  return (
    <Box h={480} style={{ minHeight: 0 }}>
      {isScenario ? (
        <PersonaTimeline workflow={workflow} />
      ) : (
        <WorkflowGraphView workflow={workflow} direction="DOWN" />
      )}
    </Box>
  )
}
