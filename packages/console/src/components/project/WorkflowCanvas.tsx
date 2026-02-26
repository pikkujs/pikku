import React, { useMemo, useEffect, useCallback } from 'react'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import { Box, Drawer, Group, Text, Alert } from '@mantine/core'
import { AlertTriangle, GitBranch, History } from 'lucide-react'
import {
  CanvasDrawerProvider,
  useCanvasDrawerContext,
} from '@/context/DrawerContext'
import { WorkflowProvider, useWorkflowContext } from '@/context/WorkflowContext'
import {
  useWorkflowRunContextSafe,
  useWorkflowRunContext,
} from '@/context/WorkflowRunContext'
import { usePanelContext } from '@/context/PanelContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { createCanvasDrawerContent } from '@/components/canvas-drawer/CanvasDrawerFactory'
import { useWorkflowRuns } from '@/hooks/useWorkflowRuns'
import { RunsPanel, type RunItem } from '@/components/layout/RunsPanel'
import { WiringNode } from '@/components/project/nodes/WiringNode'
import { FunctionNode } from '@/components/project/nodes/FunctionNode'
import { ChannelNode } from '@/components/project/nodes/ChannelNode'
import { DecisionNode } from '@/components/project/nodes/DecisionNode'
import { SleepNode } from '@/components/project/nodes/SleepNode'
import { InlineNode } from '@/components/project/nodes/InlineNode'
import { BranchNode } from '@/components/project/nodes/BranchNode'
import { FanoutNode } from '@/components/project/nodes/FanoutNode'
import { ReturnNode } from '@/components/project/nodes/ReturnNode'
import { CancelNode } from '@/components/project/nodes/CancelNode'
import { SwitchNode } from '@/components/project/nodes/SwitchNode'
import { ArrayPredicateNode } from '@/components/project/nodes/ArrayPredicateNode'
import { FilterNode } from '@/components/project/nodes/FilterNode'
import { ParallelNode } from '@/components/project/nodes/ParallelNode'
import { ChannelWiringNode } from '@/components/project/nodes/ChannelWiringNode'
import { SetNode } from '@/components/project/nodes/SetNode'
import { createFlow } from '@/hooks/useWiringFlow'
import { useElkLayout } from '@/hooks/useElkLayout'
import 'reactflow/dist/style.css'
import { ThreePaneLayout } from '../layout/ThreePaneLayout'
import { GenericNode } from './nodes/GenericNode'
import { ElkEdge } from './edges/ElkEdge'

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

const nodeTypes: NodeTypes = {
  functionNode: FunctionNode,
  wiringNode: WiringNode,
  channelNode: ChannelNode,
  decisionNode: DecisionNode,
  sleepNode: SleepNode,
  inlineNode: InlineNode,
  genericNode: GenericNode,
  branchNode: BranchNode,
  fanoutNode: FanoutNode,
  returnNode: ReturnNode,
  cancelNode: CancelNode,
  switchNode: SwitchNode,
  arrayPredicateNode: ArrayPredicateNode,
  filterNode: FilterNode,
  parallelNode: ParallelNode,
  channelWiringNode: ChannelWiringNode,
  setNode: SetNode,
}

const edgeTypes: EdgeTypes = {
  elk: ElkEdge,
}

interface WorkflowCanvasProps {
  workflow: any
  items: { name: string; description?: string }[]
  onItemSelect: (name: string) => void
}

const WorkflowCanvasFlow: React.FunctionComponent<{
  workflow: any
  onPaneClick?: () => void
}> = ({ workflow, onPaneClick }) => {
  const { fitView } = useReactFlow()

  const { nodes: flowNodes, edges: initialEdges } = useMemo(() => {
    return createFlow(workflow)
  }, [workflow])

  const layoutResult = useElkLayout(flowNodes, initialEdges)

  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])

  useEffect(() => {
    if (layoutResult.nodes.length > 0) {
      setNodes(layoutResult.nodes)
      setEdges(layoutResult.edges)
      setTimeout(() => {
        fitView({ padding: 0.2 })
      }, 50)
    }
  }, [layoutResult, setNodes, setEdges, fitView])

  return (
    <Box style={{ width: '100%', height: '100%' }}>
      <style>{`
        .react-flow__handle { opacity: 0; pointer-events: none; }
        @keyframes pulse-border { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          style: {
            stroke: '#c0c0c0',
            strokeWidth: 1.5,
            strokeDasharray: '6 4',
          },
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#c0c0c0',
            width: 16,
            height: 16,
          },
        }}
        zoomOnScroll={true}
        preventScrolling={false}
        nodesConnectable={false}
        nodesDraggable={true}
        proOptions={{ hideAttribution: true }}
        noDragClassName="nodrag"
        onPaneClick={onPaneClick}
      >
        <Background color="#ccc" variant={BackgroundVariant.Dots} size={2} />
      </ReactFlow>
    </Box>
  )
}

const WorkflowCanvasInner: React.FunctionComponent<{
  workflow: any
  onPaneClick?: () => void
}> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasFlow {...props} />
    </ReactFlowProvider>
  )
}

const WorkflowRunsPanel: React.FunctionComponent<{ workflowName: string }> = ({
  workflowName,
}) => {
  const { selectedRunId, setSelectedRunId, setIsCreatingRun } =
    useWorkflowRunContext()
  const { setActivePanel } = usePanelContext()
  const rpc = usePikkuRPC()
  const { data: runs, isLoading, refetch } = useWorkflowRuns(workflowName)

  const runItems: RunItem[] = useMemo(() => {
    if (!runs || !Array.isArray(runs)) return []
    return runs
  }, [runs])

  const handleDelete = useCallback(
    async (runId: string) => {
      await rpc('console:deleteWorkflowRun', { runId })
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
      emptyMessage="No runs found"
      statusFilters={[]}
      onNewClick={handleNewClick}
      newButtonLabel="New workflow run"
      onDelete={handleDelete}
    />
  )
}

const WorkflowCanvasContent: React.FunctionComponent<WorkflowCanvasProps> = ({
  workflow,
  items,
  onItemSelect,
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

  const runContext = useWorkflowRunContextSafe()

  const header = (
    <>
      <DetailPageHeader
        icon={GitBranch}
        category="Workflows"
        docsHref="https://pikkujs.com/docs/workflows"
        categoryPath="/workflow"
        currentItem={workflowName}
        items={items}
        onItemSelect={onItemSelect}
        subtitle={
          workflow.source ? (
            <PikkuBadge type="dynamic" badge="source" value={workflow.source} />
          ) : undefined
        }
      />
      {isComplex && (
        <Alert
          icon={<AlertTriangle size={16} />}
          color="yellow"
          radius={0}
          py="xs"
          styles={{
            root: { borderBottom: '1px solid var(--mantine-color-default-border)' },
          }}
        >
          <Group justify="space-between" align="center">
            <Text size="sm">
              This is a complex workflow. The visual representation may not be
              accurate.
            </Text>
            <Text
              size="sm"
              c="yellow.7"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              Learn more
            </Text>
          </Group>
        </Alert>
      )}
      {runContext?.isVersionMismatch && (
        <Alert
          icon={<History size={16} />}
          color="orange"
          radius={0}
          py="xs"
          styles={{
            root: { borderBottom: '1px solid var(--mantine-color-default-border)' },
          }}
        >
          <Text size="sm">
            Viewing historical version — workflow definition has changed since
            this run
          </Text>
        </Alert>
      )}
    </>
  )

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

  return (
    <>
      <ThreePaneLayout
        header={header}
        showTabs={false}
        emptyPanelMessage="Select a node to view its details"
        runsPanel={runsPanel}
      >
        <Box style={{ height: '100%', position: 'relative' }}>
          <WorkflowCanvasInner
            workflow={canvasWorkflow}
            onPaneClick={handlePaneClick}
          />
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

export const WorkflowCanvas: React.FunctionComponent<WorkflowCanvasProps> = (
  props
) => {
  return (
    <WorkflowProvider workflow={props.workflow}>
      <CanvasDrawerProvider>
        <WorkflowCanvasContent {...props} />
      </CanvasDrawerProvider>
    </WorkflowProvider>
  )
}
