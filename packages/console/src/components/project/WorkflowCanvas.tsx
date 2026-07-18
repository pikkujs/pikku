import React, { useMemo, useEffect, useCallback } from 'react'
import {
  Box,
  Drawer,
  Text,
  Alert,
  Badge,
  Tooltip,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { AlertTriangle, History } from 'lucide-react'
import { ListPageHeader } from '../layout/PageLayout'
import { WorkflowSelector } from './WorkflowSelector'
import {
  CanvasDrawerProvider,
  useCanvasDrawerContext,
} from '../../context/DrawerContext'
import {
  WorkflowProvider,
  useWorkflowContext,
} from '../../context/WorkflowContext'
import {
  useWorkflowRunContextSafe,
  useWorkflowRunContext,
} from '../../context/WorkflowRunContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { createCanvasDrawerContent } from '../canvas-drawer/CanvasDrawerFactory'
import { WorkflowTimelineDrawer } from './WorkflowTimelineDrawer'
import { PersonaTimeline } from '../flows/timeline/PersonaTimeline'
import { useWorkflowRuns } from '../../hooks/useWorkflowRuns'
import { RunsPanel, type RunItem } from '../layout/RunsPanel'
import { WorkflowGraphView } from './WorkflowGraphView'
import { ThreePaneLayout } from '../layout/ThreePaneLayout'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'

const wireTypeToWiresKey: Record<string, string> = {
  http: 'http',
  queue: 'queue',
  scheduler: 'schedule',
  trigger: 'trigger',
  cli: 'cli',
}

const wireIdMatchers: Record<string, (wire: any) => string | undefined> = {
  http: (w) => `${w.method?.toLowerCase() || 'get'}:${w.route || ''}`,
  queue: (w) => w.name,
  schedule: (w) => w.cron || w.interval,
  trigger: (w) => w.name,
  cli: (w) => w.command,
}

function filterWiresForRun(
  wires: any,
  runWire: { type: string; id?: string }
): any {
  const wiresKey = wireTypeToWiresKey[runWire.type]
  if (!wiresKey) return {}

  if (wiresKey === 'mcp' || runWire.type === 'mcp') {
    if (!wires.mcp || !runWire.id) return { mcp: wires.mcp }
    const [subType, ...rest] = runWire.id.split(':')
    const matchId = rest.join(':')
    const filtered: any = {}
    if (wires.mcp[subType]) {
      filtered[subType] = wires.mcp[subType].filter(
        (w: any) => (w.name || w.uri) === matchId
      )
    }
    return { mcp: filtered }
  }

  const entries = wires[wiresKey]
  if (!entries) return {}

  if (!runWire.id) return { [wiresKey]: entries }

  const matcher = wireIdMatchers[wiresKey]
  if (!matcher) return { [wiresKey]: entries }

  return { [wiresKey]: entries.filter((w: any) => matcher(w) === runWire.id) }
}

interface WorkflowCanvasProps {
  workflow: any
  items: { name: string; description?: string }[]
  onItemSelect: (name: string) => void
  immersiveDetail?: boolean
}

const WorkflowRunsPanel: React.FC<{
  workflowName: string
}> = ({ workflowName }) => {
  const { selectedRunId, setSelectedRunId, setIsCreatingRun } =
    useWorkflowRunContext()
  const { setActivePanel } = usePanelContext()
  const editable = useConsoleEditable()
  const rpc = usePikkuRPC()
  const { data: runs, isLoading, refetch } = useWorkflowRuns(workflowName)

  const runItems: RunItem[] = useMemo(() => {
    if (!runs || !Array.isArray(runs)) return []
    return runs
  }, [runs])

  const handleDelete = useCallback(
    async (runId: string) => {
      await rpc.invoke('console:deleteWorkflowRun', { runId })
      if (selectedRunId === runId) {
        setSelectedRunId(null)
      }
      refetch()
    },
    [rpc, selectedRunId, setSelectedRunId, refetch]
  )

  const handleNewClick = useCallback(() => {
    setSelectedRunId(null)
    setIsCreatingRun(true)
    setActivePanel(`workflow-${workflowName}`)
  }, [setSelectedRunId, setIsCreatingRun, setActivePanel, workflowName])

  return (
    <RunsPanel
      title="Runs"
      runs={runItems}
      selectedId={selectedRunId}
      onSelect={setSelectedRunId}
      onClear={() => setSelectedRunId(null)}
      loading={isLoading}
      emptyMessage={asI18n('No runs found')}
      statusFilters={[]}
      onNewClick={editable ? handleNewClick : undefined}
      newButtonLabel={editable ? asI18n('New workflow run') : undefined}
      onDelete={editable ? handleDelete : undefined}
    />
  )
}

const WorkflowCanvasContent: React.FC<WorkflowCanvasProps> = ({
  workflow,
  items,
  onItemSelect,
  immersiveDetail = false,
}) => {
  const { canvasDrawer, closeCanvasDrawer } = useCanvasDrawerContext()
  const { panels, activePanel, openWorkflow, setActivePanel } =
    usePanelContext()
  const { setFocusedNode } = useWorkflowContext()
  const workflowName = workflow.name || workflow.wireId || 'Workflow'
  const workflowPanelId = `workflow-${workflowName}`

  const handlePaneClick = useCallback(() => {
    setActivePanel(workflowPanelId)
  }, [setActivePanel, workflowPanelId])

  useEffect(() => {
    openWorkflow(workflowName, workflow)
  }, [])

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

  const drawerContent = useMemo(() => {
    return canvasDrawer ? createCanvasDrawerContent(canvasDrawer.data) : null
  }, [canvasDrawer])

  const workflowSource = workflow.source || 'graph'
  const isComplex = workflowSource === 'complex'
  const isScenario = workflowSource === 'scenario'

  const runContext = useWorkflowRunContextSafe()

  const baseWorkflow =
    runContext?.isVersionMismatch && runContext?.historicalWorkflow
      ? { ...workflow, ...runContext.historicalWorkflow }
      : workflow

  const canvasWorkflow = useMemo(() => {
    const runWire = runContext?.runData?.wire
    if (!runWire || !baseWorkflow.wires) return baseWorkflow
    return {
      ...baseWorkflow,
      wires: filterWiresForRun(baseWorkflow.wires, runWire),
    }
  }, [baseWorkflow, runContext?.runData?.wire])

  const runsPanel = runContext ? (
    <WorkflowRunsPanel workflowName={workflowName} />
  ) : undefined

  const complexNote = isComplex ? (
    <Tooltip
      label={asI18n(
        'This is a complex workflow. The visual representation may not be accurate.'
      )}
      multiline
      w={260}
    >
      <Badge
        color="yellow"
        variant="light"
        leftSection={<AlertTriangle size={12} />}
        style={{ textTransform: 'none' }}
      >
        {asI18n('Complex')}
      </Badge>
    </Tooltip>
  ) : undefined

  const header = immersiveDetail ? undefined : (
    <ListPageHeader
      title={asI18n('Workflow')}
      filters={complexNote}
      lead={
        <WorkflowSelector
          workflowName={workflowName}
          items={items}
          onItemSelect={onItemSelect}
        />
      }
    />
  )

  return (
    <>
      <ThreePaneLayout
        header={header}
        showTabs={immersiveDetail}
        collapseWhenEmpty
        emptyPanelMessage={asI18n('Select a node to view its details')}
        runsPanel={runsPanel}
      >
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
      </ThreePaneLayout>
      {canvasDrawer && (
        <Box
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 98,
          }}
          onClick={closeCanvasDrawer}
        />
      )}
      <Drawer
        opened={canvasDrawer !== null}
        onClose={closeCanvasDrawer}
        position="right"
        size="md"
        withOverlay={false}
        withinPortal={false}
        closeOnClickOutside={false}
        withCloseButton={false}
        styles={{
          inner: {
            top: '50px',
            zIndex: 99,
          },
          content: {
            height: '100%',
          },
          header: {
            display: 'none',
          },
          body: {
            padding: 0,
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  )
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
  return (
    <WorkflowProvider workflow={props.workflow}>
      <CanvasDrawerProvider>
        <WorkflowCanvasContent {...props} />
      </CanvasDrawerProvider>
    </WorkflowProvider>
  )
}
