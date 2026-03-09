import React, { useMemo, useEffect, useState } from 'react'
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
import { MantineProvider, Box } from '@mantine/core'
import { createFlow } from '@/hooks/useWiringFlow'
import { useElkLayout } from '@/hooks/useElkLayout'
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
import { GenericNode } from '@/components/project/nodes/GenericNode'
import { ElkEdge } from '@/components/project/edges/ElkEdge'
import { PanelProvider } from '@/context/PanelContext'
import 'reactflow/dist/style.css'

declare global {
  interface Window {
    __PIKKU_RENDER_DATA__?: any
    __PIKKU_RENDER_READY__?: boolean
  }
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

const RenderFlow: React.FunctionComponent<{ workflow: any }> = ({
  workflow,
}) => {
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
        setTimeout(() => {
          window.__PIKKU_RENDER_READY__ = true
        }, 100)
      }, 50)
    }
  }, [layoutResult, setNodes, setEdges, fitView])

  return (
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
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#c0c0c0',
          width: 16,
          height: 16,
        },
      }}
      zoomOnScroll={false}
      preventScrolling={true}
      nodesConnectable={false}
      nodesDraggable={false}
      panOnDrag={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="transparent" variant={BackgroundVariant.Dots} size={0} />
    </ReactFlow>
  )
}

export const RenderWorkflowPage: React.FunctionComponent = () => {
  const [workflow, setWorkflow] = useState<any>(null)

  useEffect(() => {
    if (window.__PIKKU_RENDER_DATA__) {
      setWorkflow(window.__PIKKU_RENDER_DATA__)
    }

    const handler = () => {
      if (window.__PIKKU_RENDER_DATA__) {
        setWorkflow(window.__PIKKU_RENDER_DATA__)
      }
    }
    window.addEventListener('pikku-render-data', handler)
    return () => window.removeEventListener('pikku-render-data', handler)
  }, [])

  if (!workflow) {
    return null
  }

  return (
    <MantineProvider
      defaultColorScheme="dark"
      theme={{ primaryColor: 'violet' }}
    >
      <Box
        style={{
          width: '100vw',
          height: '100vh',
          background: '#1a1b1e',
        }}
      >
        <style>{`
          .react-flow__handle { opacity: 0; pointer-events: none; }
        `}</style>
        <PanelProvider>
          <ReactFlowProvider>
            <RenderFlow workflow={workflow} />
          </ReactFlowProvider>
        </PanelProvider>
      </Box>
    </MantineProvider>
  )
}
