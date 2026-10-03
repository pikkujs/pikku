import React, { useMemo, useEffect, useState } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react'
import { MantineProvider, Box } from '@pikku/mantine/core'
import {
  createWorkflowFlow,
  useElkLayout,
  nodeTypes,
  edgeTypes,
} from '@pikku/workflow-graph'
import { PanelProvider } from '../context/PanelContext'
import '@xyflow/react/dist/style.css'

declare global {
  interface Window {
    __PIKKU_RENDER_DATA__?: any
    __PIKKU_RENDER_READY__?: boolean
  }
}

const RenderFlow: React.FC<{ workflow: any }> = ({ workflow }) => {
  const { fitView } = useReactFlow()

  const { nodes: flowNodes, edges: initialEdges } = useMemo(() => {
    return createWorkflowFlow(workflow)
  }, [workflow])

  const layoutResult = useElkLayout(flowNodes, initialEdges)

  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])

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
      <Background
        color="transparent"
        variant={BackgroundVariant.Dots}
        size={0}
      />
    </ReactFlow>
  )
}

export const RenderWorkflowPage: React.FC = () => {
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
