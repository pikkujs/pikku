import { Node, Edge } from 'reactflow'
import type { ChannelMeta } from '@pikku/core/channel'

interface ChannelFlowResult {
  nodes: Node[]
  edges: Edge[]
}

function createEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
  sourceHandle?: string
): Edge {
  const edge: Edge = {
    id,
    source,
    target,
    ...(sourceHandle && { sourceHandle }),
  }

  if (label) {
    edge.label = label
    edge.labelStyle = { fontSize: 10, fill: '#666', fontFamily: 'monospace' }
    edge.labelBgStyle = { fill: '#fff', fillOpacity: 0.8 }
  }

  return edge
}

export function createChannelFlow(
  channelName: string,
  channel: ChannelMeta
): ChannelFlowResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const pos = { x: 0, y: 0 }

  const handlers: string[] = []
  if (channel.connect) handlers.push('connect')
  if (channel.disconnect) handlers.push('disconnect')
  if (channel.message) handlers.push('message')

  const categories = Object.keys(channel.messageWirings || {})

  const entryId = 'channel-entry'
  nodes.push({
    id: entryId,
    type: 'channelEntryNode',
    position: pos,
    data: {
      channelName,
      route: channel.route,
      handlers,
      categories,
      nodeType: 'channelEntry',
      channelMeta: channel,
    },
  })

  if (channel.connect) {
    const nodeId = 'func-connect'
    nodes.push({
      id: nodeId,
      type: 'functionNode',
      position: pos,
      data: {
        type: 'Function',
        title: channel.connect.pikkuFuncId,
        colorKey: 'function',
        nodeType: 'rpc',
        inWorkflow: false,
        terminal: true,
      },
    })
    edges.push(
      createEdge('entry-to-connect', entryId, nodeId, undefined, 'connect')
    )
  }

  if (channel.disconnect) {
    const nodeId = 'func-disconnect'
    nodes.push({
      id: nodeId,
      type: 'functionNode',
      position: pos,
      data: {
        type: 'Function',
        title: channel.disconnect.pikkuFuncId,
        colorKey: 'function',
        nodeType: 'rpc',
        inWorkflow: false,
        terminal: true,
      },
    })
    edges.push(
      createEdge(
        'entry-to-disconnect',
        entryId,
        nodeId,
        undefined,
        'disconnect'
      )
    )
  }

  if (channel.message) {
    const nodeId = 'func-message'
    nodes.push({
      id: nodeId,
      type: 'functionNode',
      position: pos,
      data: {
        type: 'Function',
        title: channel.message.pikkuFuncId,
        colorKey: 'function',
        nodeType: 'rpc',
        inWorkflow: false,
        terminal: true,
      },
    })
    edges.push(
      createEdge('entry-to-message', entryId, nodeId, undefined, 'message')
    )
  }

  if (channel.messageWirings) {
    for (const [category, routes] of Object.entries(channel.messageWirings)) {
      const routerNodeId = `router-${category}`
      const actions = Object.keys(routes)

      nodes.push({
        id: routerNodeId,
        type: 'channelRouterNode',
        position: pos,
        data: {
          category,
          actions,
          nodeType: 'channelRouter',
        },
      })

      edges.push(
        createEdge(
          `entry-to-${category}`,
          entryId,
          routerNodeId,
          undefined,
          `category-${category}`
        )
      )

      for (const [action, meta] of Object.entries(routes)) {
        const funcNodeId = `func-${category}-${action}`
        nodes.push({
          id: funcNodeId,
          type: 'functionNode',
          position: pos,
          data: {
            type: 'Function',
            title: meta.pikkuFuncId,
            colorKey: 'function',
            nodeType: 'rpc',
            inWorkflow: false,
            terminal: true,
          },
        })
        edges.push(
          createEdge(
            `${routerNodeId}-to-${action}`,
            routerNodeId,
            funcNodeId,
            undefined,
            `action-${action}`
          )
        )
      }
    }
  }

  return { nodes, edges }
}
