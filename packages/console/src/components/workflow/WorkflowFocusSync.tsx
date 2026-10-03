import React, { useEffect, useRef } from 'react'
import { usePanelContext } from '../../context/PanelContext'
import { useWorkflowContext } from '../../context/WorkflowContext'
import { useWorkflowSurface } from '../../context/WorkflowSurfaceContext'

/**
 * Keeps the panel system in step with the surface.
 *
 * Two jobs, both of which span more than one panel — seeding the root workflow
 * panel, and highlighting on the canvas whichever step the inspector has open.
 * They belong to the surface rather than to either panel, otherwise a host that
 * mounts only one of them would lose or duplicate the behaviour.
 */
export const WorkflowFocusSync: React.FC = () => {
  const { panels, activePanel, openWorkflow } = usePanelContext()
  const { setFocusedNode } = useWorkflowContext()
  const { workflow, workflowName } = useWorkflowSurface()
  const seededFor = useRef<string | null>(null)

  // Seeded once per workflow, not on every graph identity change — re-seeding
  // would throw away wherever the user had navigated to inside the panel.
  useEffect(() => {
    if (!workflow || seededFor.current === workflowName) return
    seededFor.current = workflowName
    openWorkflow(workflowName, workflow)
  }, [workflow, workflowName, openWorkflow])

  useEffect(() => {
    if (!activePanel) {
      setFocusedNode(null)
      return
    }

    const panel = panels.get(activePanel)
    if (panel?.data.type === 'workflowStep') {
      setFocusedNode(panel.data.id)
    } else {
      setFocusedNode(null)
    }
  }, [activePanel, panels, setFocusedNode])

  return null
}
