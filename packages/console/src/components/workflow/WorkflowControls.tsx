import React, { useCallback } from 'react'
import { Box, Button, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Play, X } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'
import { usePaneReveal } from '../../context/PaneRevealContext'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'
import { useWorkflowSurface } from '../../context/WorkflowSurfaceContext'
import { PikkuBadge } from '../ui/PikkuBadge'

/**
 * The workflow's run controls, on the screen itself rather than only in the
 * details pane. Running a workflow is the thing this screen is for, so the
 * action belongs beside the graph — the pane is where a run is *inspected*, and
 * a reader who collapsed or closed it should still be able to start one.
 *
 * Mount anywhere under a `WorkflowSurface` that was not created `readOnly`.
 */
export const WorkflowControls: React.FC = () => {
  useLocale()
  const { workflow, workflowName, isScenario } = useWorkflowSurface()
  const runContext = useWorkflowRunContextSafe()
  const { openWorkflow } = usePanelContext()
  const revealDetails = usePaneReveal()
  const editable = useConsoleEditable()

  // `openWorkflow` rather than `setActivePanel`, because the reader may have
  // closed the panel outright rather than collapsed the pane holding it —
  // activating an id that is no longer in the map does nothing, and the run
  // form has nowhere to render.
  const openPanel = useCallback(() => {
    revealDetails?.()
    openWorkflow(workflowName, workflow)
  }, [revealDetails, openWorkflow, workflowName, workflow])

  const handleNewRun = useCallback(() => {
    runContext?.setSelectedRunId(null)
    runContext?.setIsCreatingRun(true)
    openPanel()
  }, [runContext, openPanel])

  const handleClearRun = useCallback(() => {
    runContext?.setSelectedRunId(null)
  }, [runContext])

  // A scenario is run by `pikku scenario run`, never from here, and a viewer
  // has no run controls at all.
  if (!runContext || isScenario || !editable) return null

  const { selectedRunId, runData } = runContext
  const status = runData?.status

  return (
    <Box
      px="sm"
      py={6}
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<Play size={14} />}
          onClick={handleNewRun}
          data-testid="workflow-controls-new-run"
        >
          {m.workflow_runs_new()}
        </Button>
        {selectedRunId && (
          <>
            <Text size="xs" c="dimmed" ff="monospace" truncate="end">
              {asI18n(selectedRunId)}
            </Text>
            {status && <PikkuBadge type="status" value={status} size="sm" />}
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              leftSection={<X size={14} />}
              onClick={handleClearRun}
              data-testid="workflow-controls-clear-run"
            >
              {m.workflow_controls_clear_run()}
            </Button>
          </>
        )}
      </Group>
    </Box>
  )
}
