import React, { useMemo, useCallback } from 'react'
import { Alert, Box, Center, Loader, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { GitBranch, History } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'
import { useWorkflowSurface } from '../../context/WorkflowSurfaceContext'
import { filterWiresForRun } from '../../lib/filter-wires-for-run'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PersonaTimeline } from '../flows/timeline/PersonaTimeline'
import { WorkflowGraphView } from '../project/WorkflowGraphView'
import { WorkflowTimelineDrawer } from '../project/WorkflowTimelineDrawer'

/**
 * The workflow itself — a node graph, or a persona timeline for scenarios —
 * with the run's time-travel scrubber beneath it. Mount anywhere under a
 * `WorkflowSurface`.
 */
export const WorkflowGraphPanel: React.FC = () => {
  const { workflow, workflowName, loading, isScenario } = useWorkflowSurface()
  const { setActivePanel } = usePanelContext()
  const runContext = useWorkflowRunContextSafe()

  const handlePaneClick = useCallback(() => {
    setActivePanel(`workflow-${workflowName}`)
  }, [setActivePanel, workflowName])

  const baseWorkflow =
    runContext?.isVersionMismatch && runContext?.historicalWorkflow
      ? { ...workflow, ...runContext.historicalWorkflow }
      : workflow

  const canvasWorkflow = useMemo(() => {
    const runWire = runContext?.runData?.wire
    if (!runWire || !baseWorkflow?.wires) return baseWorkflow
    return {
      ...baseWorkflow,
      wires: filterWiresForRun(baseWorkflow.wires, runWire),
    }
  }, [baseWorkflow, runContext?.runData?.wire])

  if (loading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  }

  if (!workflow) {
    return (
      <EmptyStatePlaceholder
        icon={GitBranch}
        title={m.workflows_empty_title()}
        description={m.workflows_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/workflows"
      />
    )
  }

  return (
    <Box
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {runContext?.isVersionMismatch && (
        <Alert
          icon={<History size={16} />}
          color="orange"
          radius={0}
          py="xs"
          style={{ flexShrink: 0 }}
        >
          <Text size="sm">
            {asI18n(
              'Viewing historical version — workflow definition has changed since this run'
            )}
          </Text>
        </Alert>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>
        {isScenario ? (
          <PersonaTimeline workflow={canvasWorkflow} />
        ) : (
          <WorkflowGraphView
            workflow={canvasWorkflow}
            onPaneClick={handlePaneClick}
          />
        )}
      </Box>
      <WorkflowTimelineDrawer />
    </Box>
  )
}
