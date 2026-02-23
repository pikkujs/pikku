import { useMemo, useEffect, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from 'reactflow'

const elk = new ELK()

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.edgeNode': '40',
  'elk.spacing.edgeEdge': '20',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.mergeEdges': 'false',
  'elk.edgeRouting': 'ORTHOGONAL',
}

interface ElkLayoutResult {
  nodes: Node[]
  edges: Edge[]
}

export function useElkLayout(nodes: Node[], edges: Edge[]): ElkLayoutResult {
  const [result, setResult] = useState<ElkLayoutResult>({
    nodes: [],
    edges: [],
  })
  const [isLayouting, setIsLayouting] = useState(false)

  const nodeIds = useMemo(() => nodes.map((n) => n.id).join(','), [nodes])
  const edgeIds = useMemo(() => edges.map((e) => e.id).join(','), [edges])

  useEffect(() => {
    const applyLayout = async () => {
      if (nodes.length === 0 || isLayouting) {
        return
      }

      setIsLayouting(true)

      const graph = {
        id: 'root',
        layoutOptions: elkOptions,
        children: nodes.map((node) => {
          const nodeType = node.data?.nodeType
          let width = node.width || 200
          let height = node.height || 100

          if (nodeType === 'flow') {
            width = 80
          } else if (nodeType === 'channelEntry') {
            width = 220
            const handlerCount =
              (node.data?.handlers?.length || 0) +
              (node.data?.categories?.length || 0)
            height = 55 + handlerCount * 30
          } else if (nodeType === 'channelRouter') {
            width = 200
            const actionCount = node.data?.actions?.length || 0
            height = 40 + actionCount * 28
          } else if (nodeType === 'wiring') {
            if (node.type === 'channelWiringNode') {
              width = 180
              let handlers = 3
              if (node.data?.onMessageRoute) {
                handlers += Object.keys(node.data.onMessageRoute).length
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

          if (node.data?.order !== undefined) {
            elkNode.properties = {
              'org.eclipse.elk.priority': node.data.order,
            }
          }

          return elkNode
        }),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
      }

      try {
        const layout = await elk.layout(graph)

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

        const bendPointMap = new Map<string, { x: number; y: number }[]>()
        if (layout.edges) {
          for (const elkEdge of layout.edges) {
            const sections = (elkEdge as any).sections
            if (sections && sections.length > 0) {
              const allBendPoints: { x: number; y: number }[] = []
              for (const section of sections) {
                if (section.bendPoints) {
                  for (const bp of section.bendPoints) {
                    allBendPoints.push({
                      x: bp.x,
                      y: (bp.y ?? 0) + yOffset,
                    })
                  }
                }
              }
              if (allBendPoints.length > 0) {
                bendPointMap.set(elkEdge.id, allBendPoints)
              }
            }
          }
        }

        const newEdges = edges.map((edge) => {
          const bendPoints = bendPointMap.get(edge.id)
          if (bendPoints) {
            return {
              ...edge,
              type: 'elk',
              data: { ...edge.data, bendPoints },
            }
          }
          return { ...edge, type: 'elk' }
        })

        setResult({ nodes: newNodes, edges: newEdges })
      } catch (error) {
        setResult({ nodes, edges })
      } finally {
        setIsLayouting(false)
      }
    }

    applyLayout()
  }, [nodeIds, edgeIds])

  return result.nodes.length > 0 ? result : { nodes, edges }
}
