import { useMemo, useEffect, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@xyflow/react'
import type { FlowDirection } from '../context/FlowDirectionContext'

const elk = new ELK()

const LABEL_SPACE = 58
const LABEL_WIDTH = 172
const EDGE_LABEL_HEIGHT = 18

const edgeLabelWidth = (text: string) => Math.ceil(text.length * 6.7) + 14

function tileSize(node: Node): number | null {
  if (node.type === 'branchNode') return 36
  const nodeData = node.data as any
  if (nodeData?.nodeType === 'flow' || nodeData?.nodeType === 'rpc') return 80
  if (node.type === 'functionNode') return 80
  if (nodeData?.nodeType === 'wiring' && node.type !== 'channelWiringNode')
    return 80
  return null
}

function backEdgeIds(nodes: Node[], edges: Edge[]): Set<string> {
  const outgoing = new Map<string, Edge[]>()
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  }
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const edge of outgoing.get(id) ?? []) {
      const seen = state.get(edge.target)
      if (seen === 'open') back.add(edge.id)
      else if (!seen) visit(edge.target)
    }
    state.set(id, 'done')
  }
  for (const node of nodes) if (!state.has(node.id)) visit(node.id)
  return back
}

function tileElkNode(
  node: Node,
  tile: number,
  vertical: boolean,
  loopTarget: boolean
) {
  const labelled = node.type !== 'branchNode'
  const half = tile / 2
  return {
    id: node.id,
    width: vertical && labelled ? tile + LABEL_WIDTH : tile,
    height: !vertical && labelled ? tile + LABEL_SPACE : tile,
    layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    ports: [
      {
        id: `${node.id}::in`,
        width: 0,
        height: 0,
        ...(vertical ? { x: half, y: 0 } : { x: 0, y: half }),
        layoutOptions: { 'elk.port.side': vertical ? 'NORTH' : 'WEST' },
      },
      {
        id: `${node.id}::out`,
        width: 0,
        height: 0,
        ...(vertical ? { x: half, y: tile } : { x: tile, y: half }),
        layoutOptions: { 'elk.port.side': vertical ? 'SOUTH' : 'EAST' },
      },
      ...(loopTarget
        ? [
            {
              id: `${node.id}::back`,
              width: 0,
              height: 0,
              ...(vertical
                ? { x: 0, y: half }
                : { x: half, y: labelled ? tile + LABEL_SPACE : tile }),
              layoutOptions: { 'elk.port.side': vertical ? 'WEST' : 'SOUTH' },
            },
          ]
        : []),
    ],
  }
}

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.edgeNode': '90',
  'elk.spacing.edgeEdge': '20',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.mergeEdges': 'false',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.edgeLabels.inline': 'false',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.spacing.edgeLabel': '6',
}

interface ElkLayoutResult {
  nodes: Node[]
  edges: Edge[]
}

export function useElkLayout(
  nodes: Node[],
  edges: Edge[],
  direction: FlowDirection = 'RIGHT'
): ElkLayoutResult {
  const [result, setResult] = useState<ElkLayoutResult>({
    nodes: [],
    edges: [],
  })

  const nodeIds = useMemo(() => nodes.map((n) => n.id).join(','), [nodes])
  const edgeIds = useMemo(() => edges.map((e) => e.id).join(','), [edges])

  useEffect(() => {
    // Cancellation flag (not state): a state guard would drop a dep change
    // that lands mid-layout with no retry, sticking the old layout forever.
    let cancelled = false

    const applyLayout = async () => {
      if (nodes.length === 0) {
        return
      }

      const directionOptions =
        direction === 'DOWN'
          ? {
              'elk.direction': direction,
              'elk.spacing.nodeNode': '48',
              'elk.spacing.edgeNode': '40',
              'elk.layered.spacing.nodeNodeBetweenLayers': '70',
            }
          : { 'elk.direction': direction }

      const tiled = new Set(
        nodes.filter((n) => tileSize(n) !== null).map((n) => n.id)
      )
      const back = backEdgeIds(nodes, edges)
      const loopTargets = new Set(
        edges.filter((e) => back.has(e.id)).map((e) => e.target)
      )

      const graph = {
        id: 'root',
        layoutOptions: { ...elkOptions, ...directionOptions },
        children: nodes.map((node) => {
          const tile = tileSize(node)
          if (tile !== null) {
            return tileElkNode(
              node,
              tile,
              direction === 'DOWN',
              loopTargets.has(node.id)
            )
          }
          const nodeData = node.data as any
          const nodeType = nodeData?.nodeType
          let width = node.width || 200
          let height = node.height || 100

          if (nodeType === 'flow') {
            width = 80
          } else if (nodeType === 'channelEntry') {
            width = 220
            const handlerCount =
              (nodeData?.handlers?.length || 0) +
              (nodeData?.categories?.length || 0)
            height = 55 + handlerCount * 30
          } else if (nodeType === 'channelRouter') {
            width = 200
            const actionCount = nodeData?.actions?.length || 0
            height = 40 + actionCount * 28
          } else if (nodeType === 'wiring') {
            if (node.type === 'channelWiringNode') {
              width = 180
              let handlers = 3
              if (nodeData?.onMessageRoute) {
                handlers += Object.keys(nodeData.onMessageRoute).length
              }
              height = 40 + handlers * 28
            } else {
              width = 80
            }
          } else if (nodeType === 'rpc' || node.type === 'functionNode') {
            width = 80
          }

          const elkNode: any = {
            id: node.id,
            width,
            height,
          }

          if (nodeData?.order !== undefined) {
            elkNode.properties = {
              'org.eclipse.elk.priority': nodeData.order,
            }
          }

          return elkNode
        }),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [
            tiled.has(edge.source) ? `${edge.source}::out` : edge.source,
          ],
          targets: [
            tiled.has(edge.target)
              ? `${edge.target}::${back.has(edge.id) ? 'back' : 'in'}`
              : edge.target,
          ],
          ...(typeof edge.label === 'string'
            ? {
                labels: [
                  {
                    id: `${edge.id}::label`,
                    text: edge.label,
                    width: edgeLabelWidth(edge.label),
                    height: EDGE_LABEL_HEIGHT,
                  },
                ],
              }
            : {}),
          ...(edge.data?.straightness
            ? {
                layoutOptions: {
                  'elk.layered.priority.straightness': String(
                    edge.data.straightness
                  ),
                },
              }
            : {}),
        })),
      }

      try {
        const layout = await elk.layout(graph)
        if (cancelled) return

        const minY = Math.min(...(layout.children?.map((n) => n.y || 0) || [0]))
        const yOffset = 75 - minY

        const newNodes = nodes.map((node) => {
          const layoutNode = layout.children?.find((n) => n.id === node.id)
          if (layoutNode) {
            return {
              ...node,
              position: {
                x: layoutNode.x ?? node.position.x,
                y: (layoutNode.y ?? 0) + yOffset,
              },
            }
          }
          return node
        })

        const shift = (p: { x: number; y: number }) => ({
          x: p.x,
          y: p.y + yOffset,
        })
        const routes = new Map<string, { x: number; y: number }[]>()
        const labelAt = new Map<string, { x: number; y: number }>()
        for (const elkEdge of layout.edges ?? []) {
          const sections = (elkEdge as any).sections ?? []
          if (sections.length === 0) continue
          const points: { x: number; y: number }[] = []
          for (const section of sections) {
            points.push(shift(section.startPoint))
            for (const bp of section.bendPoints ?? []) points.push(shift(bp))
            points.push(shift(section.endPoint))
          }
          routes.set(elkEdge.id, points)
          const label = (elkEdge as any).labels?.[0]
          if (label?.x !== undefined) labelAt.set(elkEdge.id, shift(label))
        }

        const newEdges = edges.map((edge) => {
          const points = routes.get(edge.id)
          return {
            ...edge,
            type: 'elk',
            ...(points
              ? {
                  sourceHandle: undefined,
                  data: {
                    ...edge.data,
                    points,
                    labelAt: labelAt.get(edge.id),
                    back: back.has(edge.id),
                  },
                }
              : {}),
          }
        })

        setResult({ nodes: newNodes, edges: newEdges })
      } catch {
        if (!cancelled) setResult({ nodes, edges })
      }
    }

    // applyLayout catches all errors itself and falls back to the unlaid-out graph
    void applyLayout()

    return () => {
      cancelled = true
    }
  }, [nodeIds, edgeIds, direction])

  return result.nodes.length > 0 ? result : { nodes, edges }
}
