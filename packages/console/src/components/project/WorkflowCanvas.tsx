import React, { useMemo, useEffect, useCallback, useState } from 'react'
import type { NodeTypes, EdgeTypes } from 'reactflow'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import {
  Box,
  Drawer,
  Text,
  Alert,
  Popover,
  TextInput,
  UnstyledButton,
  ScrollArea,
  Stack,
} from '@mantine/core'
import { AlertTriangle, History, ChevronDown, Search, Check } from 'lucide-react'
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
import { useWorkflowRuns } from '../../hooks/useWorkflowRuns'
import { RunsPanel, type RunItem } from '../layout/RunsPanel'
import { WiringNode } from './nodes/WiringNode'
import { FunctionNode } from './nodes/FunctionNode'
import { ChannelNode } from './nodes/ChannelNode'
import { DecisionNode } from './nodes/DecisionNode'
import { SleepNode } from './nodes/SleepNode'
import { InlineNode } from './nodes/InlineNode'
import { BranchNode } from './nodes/BranchNode'
import { FanoutNode } from './nodes/FanoutNode'
import { ReturnNode } from './nodes/ReturnNode'
import { CancelNode } from './nodes/CancelNode'
import { SwitchNode } from './nodes/SwitchNode'
import { ArrayPredicateNode } from './nodes/ArrayPredicateNode'
import { FilterNode } from './nodes/FilterNode'
import { ParallelNode } from './nodes/ParallelNode'
import { ChannelWiringNode } from './nodes/ChannelWiringNode'
import { SetNode } from './nodes/SetNode'
import { createFlow } from '../../hooks/useWiringFlow'
import { useElkLayout } from '../../hooks/useElkLayout'
import 'reactflow/dist/style.css'
import { ThreePaneLayout } from '../layout/ThreePaneLayout'
import { GenericNode } from './nodes/GenericNode'
import { ElkEdge } from './edges/ElkEdge'
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
  immersiveDetail?: boolean
}

const WorkflowCanvasFlow: React.FC<{
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
        <Background color="#e0e0e0" variant={BackgroundVariant.Dots} size={1} />
      </ReactFlow>
    </Box>
  )
}

const WorkflowCanvasInner: React.FC<{
  workflow: any
  onPaneClick?: () => void
}> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasFlow {...props} />
    </ReactFlowProvider>
  )
}

const WorkflowRunsPanel: React.FC<{
  workflowName: string
  items: { name: string; description?: string }[]
  onItemSelect: (name: string) => void
}> = ({ workflowName, items, onItemSelect }) => {
  const { selectedRunId, setSelectedRunId, setIsCreatingRun } =
    useWorkflowRunContext()
  const { setActivePanel } = usePanelContext()
  const editable = useConsoleEditable()
  const rpc = usePikkuRPC()
  const { data: runs, isLoading, refetch } = useWorkflowRuns(workflowName)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredItems = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleSelect = (name: string) => {
    setSelectorOpen(false)
    setSearch('')
    onItemSelect(name)
  }

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

  const selector = (
    <Popover
      opened={selectorOpen}
      onChange={setSelectorOpen}
      width={280}
      position="bottom-start"
      shadow="md"
      zIndex={10000}
    >
      <Popover.Target>
        <UnstyledButton
          px="sm"
          py="xs"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
          onClick={() => setSelectorOpen((o) => !o)}
        >
          <Text size="sm" fw={600} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workflowName}
          </Text>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <TextInput
          placeholder="Search workflows..."
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            input: {
              border: 'none',
              borderBottom: '1px solid var(--mantine-color-default-border)',
              borderRadius: 0,
            },
          }}
        />
        <ScrollArea.Autosize mah={300}>
          <Stack gap={0}>
            {filteredItems.map((item) => (
              <UnstyledButton
                key={item.name}
                onClick={() => handleSelect(item.name)}
                py="xs"
                px="sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor:
                    item.name === workflowName
                      ? 'var(--mantine-color-green-light)'
                      : undefined,
                }}
              >
                {item.name === workflowName ? (
                  <Check size={14} color="var(--mantine-color-green-6)" />
                ) : (
                  <Box w={14} />
                )}
                <div>
                  <Text size="sm" fw={item.name === workflowName ? 500 : 400}>
                    {item.name}
                  </Text>
                  {item.description && (
                    <Text size="sm" c="dimmed">
                      {item.description}
                    </Text>
                  )}
                </div>
              </UnstyledButton>
            ))}
            {filteredItems.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No results
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  )

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
      header={selector}
      onNewClick={editable ? handleNewClick : undefined}
      newButtonLabel={editable ? 'New workflow run' : undefined}
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
    <WorkflowRunsPanel
      workflowName={workflowName}
      items={items}
      onItemSelect={onItemSelect}
    />
  ) : undefined

  return (
    <>
      <ThreePaneLayout
        showTabs={immersiveDetail}
        emptyPanelMessage="Select a node to view its details"
        runsPanel={runsPanel}
      >
        <Box style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {isComplex && (
            <Alert
              icon={<AlertTriangle size={16} />}
              color="yellow"
              radius={0}
              py="xs"
              style={{ flexShrink: 0 }}
            >
              <Text size="sm">
                This is a complex workflow. The visual representation may not be accurate.
              </Text>
            </Alert>
          )}
          {runContext?.isVersionMismatch && (
            <Alert
              icon={<History size={16} />}
              color="orange"
              radius={0}
              py="xs"
              style={{ flexShrink: 0 }}
            >
              <Text size="sm">
                Viewing historical version — workflow definition has changed since this run
              </Text>
            </Alert>
          )}
          <Box style={{ flex: 1, minHeight: 0 }}>
            <WorkflowCanvasInner
              workflow={canvasWorkflow}
              onPaneClick={handlePaneClick}
            />
          </Box>
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
