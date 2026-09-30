import React, { useMemo, useEffect } from 'react'
import type { NodeTypes, EdgeTypes, Node, Edge } from '@xyflow/react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react'
import { Box } from '@pikku/mantine/core'
import type { WorkflowGraphViewProps } from './WorkflowGraphView'
import { WiringNode } from './components/nodes/WiringNode'
import { FunctionNode } from './components/nodes/FunctionNode'
import { ChannelNode } from './components/nodes/ChannelNode'
import { DecisionNode } from './components/nodes/DecisionNode'
import { SleepNode } from './components/nodes/SleepNode'
import { SuspendNode } from './components/nodes/SuspendNode'
import { InlineNode } from './components/nodes/InlineNode'
import { BranchNode } from './components/nodes/BranchNode'
import { FanoutNode } from './components/nodes/FanoutNode'
import { ReturnNode } from './components/nodes/ReturnNode'
import { CancelNode } from './components/nodes/CancelNode'
import { SwitchNode } from './components/nodes/SwitchNode'
import { ArrayPredicateNode } from './components/nodes/ArrayPredicateNode'
import { FilterNode } from './components/nodes/FilterNode'
import { ParallelNode } from './components/nodes/ParallelNode'
import { ChannelWiringNode } from './components/nodes/ChannelWiringNode'
import { SetNode } from './components/nodes/SetNode'
import { GenericNode } from './components/nodes/GenericNode'
import { ElkEdge } from './components/edges/ElkEdge'
import { createWorkflowFlow } from './hooks/create-workflow-flow'
import { useElkLayout } from './hooks/useElkLayout'
import { useGraphRun, type WorkflowGraphRun } from './context/GraphHostContext'
import '@xyflow/react/dist/style.css'

const graphNodeTypes = {
  functionNode: FunctionNode,
  wiringNode: WiringNode,
  channelNode: ChannelNode,
  decisionNode: DecisionNode,
  sleepNode: SleepNode,
  suspendNode: SuspendNode,
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

const REACHED = new Set([
  'running',
  'succeeded',
  'completed',
  'failed',
  'suspended',
  'cancelled',
  'compensating',
  'compensated',
  'compensation_failed',
])

const STRUCTURAL = new Set([
  'branchNode',
  'switchNode',
  'parallelNode',
  'fanoutNode',
  'filterNode',
  'arrayPredicateNode',
  'setNode',
])

const NOT_TAKEN = { strokeDasharray: '2 5', opacity: 0.45 }

function reachedNodes(
  nodes: Node[],
  edges: Edge[],
  run: WorkflowGraphRun
): Set<string> {
  const recorded = new Set(run.stepStates.keys())
  const reached = new Set(
    [...run.stepStates]
      .filter(([, s]) => REACHED.has(String(s.status)))
      .map(([id]) => id)
  )
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (
        reached.has(node.id) ||
        recorded.has(node.id) ||
        !STRUCTURAL.has(node.type ?? '')
      )
        continue
      if (edges.some((e) => e.source === node.id && reached.has(e.target))) {
        reached.add(node.id)
        grew = true
      }
    }
  }
  return reached
}

function paintTakenRoutes(
  nodes: Node[],
  edges: Edge[],
  run: WorkflowGraphRun | null
): Edge[] {
  if (!run?.runId) return edges
  const reached = reachedNodes(nodes, edges, run)
  const finished = (id: string) =>
    ['succeeded', 'completed'].includes(String(run.stepStates.get(id)?.status))
  const joins = (e: Edge) =>
    reached.has(e.source) &&
    reached.has(e.target) &&
    (!e.data?.back || finished(e.source))
  return edges.map((edge) => {
    const taken =
      joins(edge) &&
      !(
        edge.data?.skip &&
        edges.some(
          (other) =>
            other !== edge && other.source === edge.source && joins(other)
        )
      )
    return taken ? edge : { ...edge, style: { ...edge.style, ...NOT_TAKEN } }
  })
}

export const nodeTypes = graphNodeTypes as unknown as NodeTypes

const graphEdgeTypes = {
  elk: ElkEdge,
}

export const edgeTypes = graphEdgeTypes as unknown as EdgeTypes

/** Inner flow of WorkflowGraphView: createWorkflowFlow → ELK layout → xyflow.
 *  Must render inside a ReactFlowProvider (WorkflowGraphView supplies it). */
export const WorkflowGraphFlow: React.FC<WorkflowGraphViewProps> = ({
  workflow,
  direction = 'RIGHT',
  onPaneClick,
}) => {
  const { fitView } = useReactFlow()
  const run = useGraphRun()

  const { nodes: flowNodes, edges: initialEdges } = useMemo(() => {
    return createWorkflowFlow(workflow)
  }, [workflow])

  const layoutResult = useElkLayout(flowNodes, initialEdges, direction)

  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])

  useEffect(() => {
    if (layoutResult.nodes.length > 0) {
      setNodes(layoutResult.nodes)
      setEdges(layoutResult.edges)
      const timer = setTimeout(() => {
        fitView({ padding: 0.2 })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [layoutResult, setNodes, setEdges, fitView])

  const paintedEdges = useMemo(
    () => paintTakenRoutes(layoutResult.nodes, edges, run),
    [layoutResult.nodes, edges, run]
  )

  return (
    <Box style={{ width: '100%', height: '100%' }}>
      <style>{`
        .react-flow__handle { opacity: 0; pointer-events: none; }
        @keyframes pulse-border { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={paintedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          style: {
            stroke: 'var(--mantine-color-dimmed)',
            strokeWidth: 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--mantine-color-dimmed)',
            width: 14,
            height: 14,
          },
        }}
        zoomOnScroll={true}
        preventScrolling={false}
        minZoom={0.15}
        nodesConnectable={false}
        nodesDraggable={true}
        proOptions={{ hideAttribution: true }}
        noDragClassName="nodrag"
        onPaneClick={onPaneClick}
      >
        <Background
          color="var(--mantine-color-default-border)"
          variant={BackgroundVariant.Dots}
          size={1}
        />
      </ReactFlow>
    </Box>
  )
}
