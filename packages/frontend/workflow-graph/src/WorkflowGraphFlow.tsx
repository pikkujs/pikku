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
        minZoom={0.15}
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
