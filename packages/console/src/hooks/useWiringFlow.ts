import type { Node, Edge } from 'reactflow'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { getBranchNodeConfig } from '@/components/project/nodes/BranchNode'
import { getFunctionNodeConfig } from '@/components/project/nodes/FunctionNode'
import { getSleepNodeConfig } from '@/components/project/nodes/SleepNode'
import { getInlineNodeConfig } from '@/components/project/nodes/InlineNode'
import { getGenericNodeConfig } from '@/components/project/nodes/GenericNode'
import { getFanoutNodeConfig } from '@/components/project/nodes/FanoutNode'
import { getReturnNodeConfig } from '@/components/project/nodes/ReturnNode'
import { getCancelNodeConfig } from '@/components/project/nodes/CancelNode'
import { getSwitchNodeConfig } from '@/components/project/nodes/SwitchNode'
import { getArrayPredicateNodeConfig } from '@/components/project/nodes/ArrayPredicateNode'
import { getFilterNodeConfig } from '@/components/project/nodes/FilterNode'
import { getParallelNodeConfig } from '@/components/project/nodes/ParallelNode'
import { getSetNodeConfig } from '@/components/project/nodes/SetNode'
import {
  getHttpWiringNodeConfig,
  getQueueWiringNodeConfig,
  getCliWiringNodeConfig,
  getMcpToolWiringNodeConfig,
  getMcpPromptWiringNodeConfig,
  getMcpResourceWiringNodeConfig,
  getScheduleWiringNodeConfig,
  getNamedWiringNodeConfig,
} from '@/components/project/nodes/WiringNode'
import { getChannelWiringNodeConfig } from '@/components/project/nodes/ChannelWiringNode'

interface WiringFlowResult {
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

function getStepType(step: any): string {
  if (step.rpcName) {
    return 'rpc'
  }
  if (step.flow) {
    return step.flow
  }
  return 'unknown'
}

function processStep(
  step: any,
  stepNodeId: string,
  position: { x: number; y: number },
  index?: number
): { nodes: Node[]; edges: Edge[]; stepType: string } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const stepType = getStepType(step)

  switch (stepType) {
    case 'rpc': {
      const functionNode = getFunctionNodeConfig(
        stepNodeId,
        step.rpcName,
        position,
        step.stepName,
        index,
        undefined,
        step
      )
      nodes.push(functionNode)
      break
    }
    case 'sleep': {
      const sleepNode = getSleepNodeConfig(stepNodeId, position, step)
      nodes.push(sleepNode)
      break
    }
    case 'inline': {
      const functionNode = getFunctionNodeConfig(
        stepNodeId,
        'inline',
        position,
        step.stepName,
        index,
        undefined,
        step
      )
      nodes.push(functionNode)
      break
    }
    case 'branch': {
      const branchNode = getBranchNodeConfig(stepNodeId, position, step)
      nodes.push(branchNode)
      break
    }
    case 'switch': {
      const switchNode = getSwitchNodeConfig(stepNodeId, position, step)
      nodes.push(switchNode)
      break
    }
    case 'fanout': {
      const fanoutNode = getFanoutNodeConfig(stepNodeId, position, step)
      nodes.push(fanoutNode)
      break
    }
    case 'arrayPredicate': {
      const arrayPredicateNode = getArrayPredicateNodeConfig(
        stepNodeId,
        position,
        step
      )
      nodes.push(arrayPredicateNode)
      break
    }
    case 'filter': {
      const filterNode = getFilterNodeConfig(stepNodeId, position, step)
      nodes.push(filterNode)
      break
    }
    case 'parallel': {
      const parallelNode = getParallelNodeConfig(stepNodeId, position, step)
      nodes.push(parallelNode)
      break
    }
    case 'return': {
      const returnNode = getReturnNodeConfig(stepNodeId, position, step)
      nodes.push(returnNode)
      break
    }
    case 'cancel': {
      const cancelNode = getCancelNodeConfig(stepNodeId, position, step)
      nodes.push(cancelNode)
      break
    }
    case 'set': {
      const setNode = getSetNodeConfig(stepNodeId, position, step)
      nodes.push(setNode)
      break
    }
    default: {
      const genericNode = getGenericNodeConfig(stepNodeId, position, step)
      nodes.push(genericNode)
      break
    }
  }

  return { nodes, edges, stepType }
}

function getSourceHandle(
  stepType: string,
  edgeType: string
): string | undefined {
  if (edgeType === 'next') {
    if (stepType === 'fanout' || stepType === 'parallel') {
      return 'done'
    }
    if (stepType === 'branch' || stepType === 'switch') {
      return 'after'
    }
  }
  if (edgeType === 'then') {
    return 'true'
  }
  if (edgeType === 'child') {
    return 'each'
  }
  if (edgeType.startsWith('case-')) {
    return edgeType
  }
  if (edgeType === 'default') {
    return 'default'
  }
  if (edgeType.startsWith('parallel-')) {
    const index = edgeType.replace('parallel-', '')
    return `child-${index}`
  }
  return undefined
}

export function createFlow(workflow: WorkflowsMeta[0]): WiringFlowResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const workflowNodes = (workflow as any).nodes
  const entryNodeIds = (workflow as any).entryNodeIds
  const wires = (workflow as any).wires

  if (!workflowNodes || Object.keys(workflowNodes).length === 0) {
    return { nodes, edges }
  }

  const triggerXPosition = 50
  const xPosition = 325
  const processedNodeIds = new Set<string>()
  const nodePositions = new Map<string, { x: number; y: number }>()
  const parallelChildren = new Map<string, Set<string>>()
  let currentY = 0
  let triggerY = 0

  Object.values(workflowNodes).forEach((step: any) => {
    if (step.flow === 'parallel' && step.children) {
      const childSet = new Set<string>(step.children)
      step.children.forEach((childId: string) => {
        parallelChildren.set(childId, childSet)
      })
    }
  })

  function processNode(nodeId: string, depth: number = 0): void {
    if (processedNodeIds.has(nodeId)) {
      return
    }

    const step = workflowNodes[nodeId]
    if (!step) {
      return
    }

    processedNodeIds.add(nodeId)

    const position = {
      x: xPosition + depth * 250,
      y: currentY,
    }
    nodePositions.set(nodeId, position)
    currentY += 100

    const stepType = getStepType(step)

    const result = processStep(step, nodeId, position)
    nodes.push(...result.nodes)
    edges.push(...result.edges)

    if (stepType === 'branch') {
      if (step.thenEntry) {
        edges.push(
          createEdge(
            `${nodeId}-to-${step.thenEntry}`,
            nodeId,
            step.thenEntry,
            undefined,
            getSourceHandle(stepType, 'then')
          )
        )
        processNode(step.thenEntry, depth + 1)
      }
      if (step.elseEntry) {
        edges.push(
          createEdge(
            `${nodeId}-to-${step.elseEntry}`,
            nodeId,
            step.elseEntry,
            undefined,
            'false'
          )
        )
        processNode(step.elseEntry, depth + 1)
      }
      if (step.branches && Array.isArray(step.branches)) {
        step.branches.forEach((branch: any, branchIndex: number) => {
          if (branch.entry) {
            edges.push(
              createEdge(
                `${nodeId}-branch-${branchIndex}-to-${branch.entry}`,
                nodeId,
                branch.entry,
                undefined,
                branchIndex === 0 ? 'true' : `branch-${branchIndex}`
              )
            )
            processNode(branch.entry, depth + 1)
          }
        })
      }
    }

    if (stepType === 'switch') {
      if (step.cases) {
        step.cases.forEach((caseItem: any, caseIndex: number) => {
          if (caseItem.entry) {
            edges.push(
              createEdge(
                `${nodeId}-case-${caseIndex}-to-${caseItem.entry}`,
                nodeId,
                caseItem.entry,
                undefined,
                getSourceHandle(stepType, `case-${caseItem.value}`)
              )
            )
            processNode(caseItem.entry, depth + 1)
          }
        })
      }
      if (step.defaultEntry) {
        edges.push(
          createEdge(
            `${nodeId}-default-to-${step.defaultEntry}`,
            nodeId,
            step.defaultEntry,
            undefined,
            getSourceHandle(stepType, 'default')
          )
        )
        processNode(step.defaultEntry, depth + 1)
      }
    }

    if (stepType === 'fanout' && step.childEntry) {
      edges.push(
        createEdge(
          `${nodeId}-to-${step.childEntry}`,
          nodeId,
          step.childEntry,
          undefined,
          getSourceHandle(stepType, 'child')
        )
      )
      processNode(step.childEntry, depth + 1)
    }

    if (stepType === 'parallel' && step.children) {
      step.children.forEach((childNodeId: string, childIndex: number) => {
        edges.push(
          createEdge(
            `${nodeId}-parallel-${childIndex}-to-${childNodeId}`,
            nodeId,
            childNodeId,
            undefined,
            getSourceHandle(stepType, `parallel-${childIndex}`)
          )
        )
        processNode(childNodeId, depth + 1)
      })
    }

    if (step.next) {
      const nextTargets = Array.isArray(step.next) ? step.next : [step.next]
      const siblingSet = parallelChildren.get(nodeId)

      nextTargets.forEach((target: string) => {
        const isNextASibling = siblingSet && siblingSet.has(target)
        if (!isNextASibling) {
          edges.push(
            createEdge(
              `${nodeId}-to-${target}`,
              nodeId,
              target,
              undefined,
              getSourceHandle(stepType, 'next')
            )
          )
        }
        processNode(target, depth)
      })
    }
  }

  if (entryNodeIds && entryNodeIds.length > 0) {
    entryNodeIds.forEach((entryNodeId: string) => {
      processNode(entryNodeId)
    })
  } else {
    const firstNodeId = Object.keys(workflowNodes)[0]
    if (firstNodeId) {
      processNode(firstNodeId)
    }
  }

  if (wires) {
    if (wires.http && Array.isArray(wires.http)) {
      wires.http.forEach((wire: any, index: number) => {
        const triggerId = `http-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        triggerY += 120

        const triggerNode = getHttpWiringNodeConfig(triggerId, position, wire)
        nodes.push(triggerNode)

        if (wire.startNode) {
          edges.push(
            createEdge(
              `${triggerId}-to-${wire.startNode}`,
              triggerId,
              wire.startNode,
              undefined,
              'start'
            )
          )
        }
      })
    }

    if (wires.channel && Array.isArray(wires.channel)) {
      wires.channel.forEach((wire: any, index: number) => {
        const triggerId = `channel-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        const routeCount = wire.onMessageRoute
          ? Object.keys(wire.onMessageRoute).length
          : 0
        triggerY += 100 + routeCount * 30

        const triggerNode = getChannelWiringNodeConfig(
          triggerId,
          position,
          wire
        )
        nodes.push(triggerNode)

        if (wire.onConnect) {
          edges.push(
            createEdge(
              `${triggerId}-onConnect-to-${wire.onConnect}`,
              triggerId,
              wire.onConnect,
              undefined,
              'onConnect'
            )
          )
        }
        if (wire.onMessage) {
          edges.push(
            createEdge(
              `${triggerId}-onMessage-to-${wire.onMessage}`,
              triggerId,
              wire.onMessage,
              undefined,
              'onMessage'
            )
          )
        }
        if (wire.onMessageRoute) {
          Object.entries(wire.onMessageRoute).forEach(([route, target]) => {
            if (target) {
              edges.push(
                createEdge(
                  `${triggerId}-route-${route}-to-${target}`,
                  triggerId,
                  target as string,
                  undefined,
                  `route-${route}`
                )
              )
            }
          })
        }
        if (wire.onDisconnect) {
          edges.push(
            createEdge(
              `${triggerId}-onDisconnect-to-${wire.onDisconnect}`,
              triggerId,
              wire.onDisconnect,
              undefined,
              'onDisconnect'
            )
          )
        }
      })
    }

    if (wires.queue && Array.isArray(wires.queue)) {
      wires.queue.forEach((wire: any, index: number) => {
        const triggerId = `queue-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        triggerY += 120

        const triggerNode = getQueueWiringNodeConfig(triggerId, position, wire)
        nodes.push(triggerNode)

        if (wire.startNode) {
          edges.push(
            createEdge(
              `${triggerId}-to-${wire.startNode}`,
              triggerId,
              wire.startNode,
              undefined,
              'start'
            )
          )
        }
      })
    }

    if (wires.cli && Array.isArray(wires.cli)) {
      wires.cli.forEach((wire: any, index: number) => {
        const triggerId = `cli-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        triggerY += 120

        const triggerNode = getCliWiringNodeConfig(triggerId, position, wire)
        nodes.push(triggerNode)

        if (wire.startNode) {
          edges.push(
            createEdge(
              `${triggerId}-to-${wire.startNode}`,
              triggerId,
              wire.startNode,
              undefined,
              'start'
            )
          )
        }
      })
    }

    if (wires.mcp) {
      if (wires.mcp.tool && Array.isArray(wires.mcp.tool)) {
        wires.mcp.tool.forEach((wire: any, index: number) => {
          const triggerId = `mcp-tool-trigger-${index}`
          const position = { x: triggerXPosition, y: triggerY }
          triggerY += 120

          const triggerNode = getMcpToolWiringNodeConfig(
            triggerId,
            position,
            wire
          )
          nodes.push(triggerNode)

          if (wire.startNode) {
            edges.push(
              createEdge(
                `${triggerId}-to-${wire.startNode}`,
                triggerId,
                wire.startNode,
                undefined,
                'start'
              )
            )
          }
        })
      }

      if (wires.mcp.prompt && Array.isArray(wires.mcp.prompt)) {
        wires.mcp.prompt.forEach((wire: any, index: number) => {
          const triggerId = `mcp-prompt-trigger-${index}`
          const position = { x: triggerXPosition, y: triggerY }
          triggerY += 120

          const triggerNode = getMcpPromptWiringNodeConfig(
            triggerId,
            position,
            wire
          )
          nodes.push(triggerNode)

          if (wire.startNode) {
            edges.push(
              createEdge(
                `${triggerId}-to-${wire.startNode}`,
                triggerId,
                wire.startNode,
                undefined,
                'start'
              )
            )
          }
        })
      }

      if (wires.mcp.resource && Array.isArray(wires.mcp.resource)) {
        wires.mcp.resource.forEach((wire: any, index: number) => {
          const triggerId = `mcp-resource-trigger-${index}`
          const position = { x: triggerXPosition, y: triggerY }
          triggerY += 120

          const triggerNode = getMcpResourceWiringNodeConfig(
            triggerId,
            position,
            wire
          )
          nodes.push(triggerNode)

          if (wire.startNode) {
            edges.push(
              createEdge(
                `${triggerId}-to-${wire.startNode}`,
                triggerId,
                wire.startNode,
                undefined,
                'start'
              )
            )
          }
        })
      }
    }

    if (wires.schedule && Array.isArray(wires.schedule)) {
      wires.schedule.forEach((wire: any, index: number) => {
        const triggerId = `schedule-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        triggerY += 120

        const triggerNode = getScheduleWiringNodeConfig(
          triggerId,
          position,
          wire
        )
        nodes.push(triggerNode)

        if (wire.startNode) {
          edges.push(
            createEdge(
              `${triggerId}-to-${wire.startNode}`,
              triggerId,
              wire.startNode,
              undefined,
              'start'
            )
          )
        }
      })
    }

    if (wires.trigger && Array.isArray(wires.trigger)) {
      wires.trigger.forEach((wire: any, index: number) => {
        const triggerId = `named-trigger-${index}`
        const position = { x: triggerXPosition, y: triggerY }
        triggerY += 120

        const triggerNode = getNamedWiringNodeConfig(triggerId, position, wire)
        nodes.push(triggerNode)

        if (wire.startNode) {
          edges.push(
            createEdge(
              `${triggerId}-to-${wire.startNode}`,
              triggerId,
              wire.startNode,
              undefined,
              'start'
            )
          )
        }
      })
    }
  }

  return { nodes, edges }
}
