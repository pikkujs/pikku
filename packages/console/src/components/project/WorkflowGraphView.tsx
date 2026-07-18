import React, { useMemo, useEffect } from 'react'
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
import { Box } from '@pikku/mantine/core'
import {
  FlowDirectionContext,
  type FlowDirection,
} from '../../context/FlowDirectionContext'
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
import { GenericNode } from './nodes/GenericNode'
import { ElkEdge } from './edges/ElkEdge'
import { createFlow } from '../../hooks/useWiringFlow'
import { useElkLayout } from '../../hooks/useElkLayout'
import 'reactflow/dist/style.css'

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

export interface WorkflowGraphViewProps {
  workflow: any
  /** 'RIGHT' (default) lays the graph out left→right; 'DOWN' top→bottom —
   *  use 'DOWN' when embedding in a narrow container like a side panel. */
  direction?: FlowDirection
  onPaneClick?: () => void
}

const WorkflowGraphFlow: React.FC<WorkflowGraphViewProps> = ({
  workflow,
  direction = 'RIGHT',
  onPaneClick,
}) => {
  const { fitView } = useReactFlow()

  const { nodes: flowNodes, edges: initialEdges } = useMemo(() => {
    return createFlow(workflow)
  }, [workflow])

  const layoutResult = useElkLayout(flowNodes, initialEdges, direction)

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

/** Standalone workflow graph renderer: createFlow → ELK layout → reactflow,
 *  with its own ReactFlowProvider so it can be embedded anywhere (full canvas
 *  page, side panel, …). Interactivity (node click → panels) comes from the
 *  surrounding Panel/Workflow contexts, which the host must provide. */
export const WorkflowGraphView: React.FC<WorkflowGraphViewProps> = (props) => {
  return (
    <FlowDirectionContext.Provider value={props.direction ?? 'RIGHT'}>
      <ReactFlowProvider>
        <WorkflowGraphFlow {...props} />
      </ReactFlowProvider>
    </FlowDirectionContext.Provider>
  )
}
