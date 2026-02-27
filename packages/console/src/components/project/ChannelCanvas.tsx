import React, { useMemo, useEffect } from 'react'
import type { NodeTypes, EdgeTypes } from 'reactflow'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import { Box } from '@mantine/core'
import { Radio } from 'lucide-react'
import { FunctionNode } from '@/components/project/nodes/FunctionNode'
import { ChannelEntryNode } from '@/components/project/nodes/ChannelEntryNode'
import { ChannelRouterNode } from '@/components/project/nodes/ChannelRouterNode'
import { createChannelFlow } from '@/hooks/useChannelFlow'
import { useElkLayout } from '@/hooks/useElkLayout'
import { ElkEdge } from './edges/ElkEdge'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import 'reactflow/dist/style.css'
import type { ChannelMeta } from '@pikku/core/channel'

const nodeTypes: NodeTypes = {
  channelEntryNode: ChannelEntryNode,
  channelRouterNode: ChannelRouterNode,
  functionNode: FunctionNode,
}

const edgeTypes: EdgeTypes = {
  elk: ElkEdge,
}

interface ChannelCanvasProps {
  channelName: string
  channelMeta: ChannelMeta
  items: { name: string; description?: string }[]
  onItemSelect: (name: string) => void
}

const ChannelCanvasFlow: React.FunctionComponent<{
  channelName: string
  channelMeta: ChannelMeta
}> = ({ channelName, channelMeta }) => {
  const { setViewport } = useReactFlow()

  const { nodes: flowNodes, edges: initialEdges } = useMemo(() => {
    return createChannelFlow(channelName, channelMeta)
  }, [channelName, channelMeta])

  const layoutResult = useElkLayout(flowNodes, initialEdges)

  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])

  useEffect(() => {
    if (layoutResult.nodes.length > 0) {
      setNodes(layoutResult.nodes)
      setEdges(layoutResult.edges)
      setTimeout(() => {
        setViewport({ x: 40, y: 40, zoom: 1 })
      }, 50)
    }
  }, [layoutResult, setNodes, setEdges, setViewport])

  return (
    <Box style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          style: { stroke: '#c0c0c0', strokeWidth: 1.5 },
        }}
        zoomOnScroll={true}
        preventScrolling={false}
        nodesConnectable={false}
        nodesDraggable={true}
        proOptions={{ hideAttribution: true }}
        noDragClassName="nodrag"
        minZoom={1}
        maxZoom={1}
      >
        <Background color="#f5f5f5" variant={BackgroundVariant.Lines} gap={0} />
      </ReactFlow>
    </Box>
  )
}

export const ChannelCanvas: React.FunctionComponent<ChannelCanvasProps> = ({
  channelName,
  channelMeta,
  items,
  onItemSelect,
}) => {
  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Radio}
          category="Channels"
          docsHref="https://pikku.dev/docs/wiring/channels"
          categoryPath="/apis/channels"
          currentItem={channelName}
          items={items}
          onItemSelect={onItemSelect}
        />
      }
      showTabs={false}
      emptyPanelMessage="Click a node to see its details"
    >
      <Box style={{ height: '100%', position: 'relative' }}>
        <ReactFlowProvider>
          <ChannelCanvasFlow
            channelName={channelName}
            channelMeta={channelMeta}
          />
        </ReactFlowProvider>
      </Box>
    </ResizablePanelLayout>
  )
}
