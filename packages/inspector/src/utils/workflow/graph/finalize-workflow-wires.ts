import type { InspectorState } from '../../../types.js'
import type {
  SerializedWorkflowGraph,
  WorkflowWires,
} from './workflow-graph.types.js'
import type { CLICommandMeta } from '@pikku/core/cli'

function parseWorkflowFuncId(
  pikkuFuncId: string
): { workflowName: string; startNode?: string } | null {
  for (const prefix of ['workflowStart:', 'workflow:']) {
    if (pikkuFuncId.startsWith(prefix)) {
      return { workflowName: pikkuFuncId.slice(prefix.length) }
    }
  }
  if (pikkuFuncId.startsWith('graphStart:')) {
    const rest = pikkuFuncId.slice('graphStart:'.length)
    const colonIdx = rest.indexOf(':')
    if (colonIdx !== -1) {
      return {
        workflowName: rest.slice(0, colonIdx),
        startNode: rest.slice(colonIdx + 1),
      }
    }
  }
  return null
}

function resolveStartNode(
  parsed: { workflowName: string; startNode?: string },
  graph: SerializedWorkflowGraph
): string {
  return parsed.startNode ?? graph.entryNodeIds[0]
}

function getOrCreateWires(graph: SerializedWorkflowGraph): WorkflowWires {
  if (!graph.wires) {
    graph.wires = {}
  }
  return graph.wires
}

export function finalizeWorkflowHelperTypes(state: InspectorState): void {
  const { functions, workflows } = state
  const graphMeta = workflows.graphMeta

  for (const meta of Object.values(functions.meta)) {
    if (meta.functionType !== 'helper') continue
    if (meta.pikkuFuncId.startsWith('workflowStatus:')) continue

    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue

    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue

    const startNodeId = resolveStartNode(parsed, graph)
    const startNode = graph.nodes[startNodeId]
    if (!startNode || !('rpcName' in startNode)) continue

    const rpcMeta = functions.meta[startNode.rpcName as string]
    if (!rpcMeta) continue

    if (rpcMeta.inputSchemaName) {
      meta.inputSchemaName = rpcMeta.inputSchemaName
    }
    if (rpcMeta.inputs && rpcMeta.inputs.length > 0) {
      meta.inputs = rpcMeta.inputs
    }
  }
}

export function finalizeWorkflowWires(state: InspectorState): void {
  const { workflows } = state
  const graphMeta = workflows.graphMeta

  scanHTTP(state, graphMeta)
  scanScheduledTasks(state, graphMeta)
  scanTriggers(state, graphMeta)
  scanQueueWorkers(state, graphMeta)
  scanChannels(state, graphMeta)
  scanMCPEndpoints(state, graphMeta)
  scanCLI(state, graphMeta)
}

function scanHTTP(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const [method, routes] of Object.entries(state.http.meta)) {
    for (const [route, meta] of Object.entries(routes)) {
      const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
      if (!parsed) continue
      const graph = graphMeta[parsed.workflowName]
      if (!graph) continue
      const wires = getOrCreateWires(graph)
      if (!wires.http) wires.http = []
      wires.http.push({
        route,
        method,
        startNode: resolveStartNode(parsed, graph),
      })
    }
  }
}

function scanScheduledTasks(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const meta of Object.values(state.scheduledTasks.meta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.schedule) wires.schedule = []
    wires.schedule.push({
      cron: meta.schedule,
      startNode: resolveStartNode(parsed, graph),
    })
  }
}

function scanTriggers(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const meta of Object.values(state.triggers.meta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.trigger) wires.trigger = []
    wires.trigger.push({
      name: meta.name,
      startNode: resolveStartNode(parsed, graph),
    })
  }
}

function scanQueueWorkers(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const meta of Object.values(state.queueWorkers.meta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.queue) wires.queue = []
    wires.queue.push({
      name: meta.name,
      startNode: resolveStartNode(parsed, graph),
    })
  }
}

function scanChannels(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const channelMeta of Object.values(state.channels.meta)) {
    const wire: NonNullable<WorkflowWires['channel']>[number] = {
      name: channelMeta.name,
      route: channelMeta.route,
    }
    let targetWorkflow: SerializedWorkflowGraph | undefined

    if (channelMeta.connect) {
      const parsed = parseWorkflowFuncId(channelMeta.connect.pikkuFuncId)
      if (parsed) {
        const graph = graphMeta[parsed.workflowName]
        if (graph) {
          targetWorkflow = graph
          wire.onConnect = resolveStartNode(parsed, graph)
        }
      }
    }

    if (channelMeta.disconnect) {
      const parsed = parseWorkflowFuncId(channelMeta.disconnect.pikkuFuncId)
      if (parsed) {
        const graph = graphMeta[parsed.workflowName]
        if (graph) {
          targetWorkflow = targetWorkflow ?? graph
          wire.onDisconnect = resolveStartNode(parsed, graph)
        }
      }
    }

    if (channelMeta.message) {
      const parsed = parseWorkflowFuncId(channelMeta.message.pikkuFuncId)
      if (parsed) {
        const graph = graphMeta[parsed.workflowName]
        if (graph) {
          targetWorkflow = targetWorkflow ?? graph
          wire.onMessage = resolveStartNode(parsed, graph)
        }
      }
    }

    for (const [routingProp, routeMap] of Object.entries(
      channelMeta.messageWirings
    )) {
      for (const [routeValue, messageMeta] of Object.entries(routeMap)) {
        const parsed = parseWorkflowFuncId(messageMeta.pikkuFuncId)
        if (!parsed) continue
        const graph = graphMeta[parsed.workflowName]
        if (!graph) continue
        targetWorkflow = targetWorkflow ?? graph
        if (!wire.onMessageRoute) wire.onMessageRoute = {}
        wire.onMessageRoute[`${routingProp}:${routeValue}`] = resolveStartNode(
          parsed,
          graph
        )
      }
    }

    if (targetWorkflow) {
      const wires = getOrCreateWires(targetWorkflow)
      if (!wires.channel) wires.channel = []
      wires.channel.push(wire)
    }
  }
}

function scanMCPEndpoints(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const meta of Object.values(state.mcpEndpoints.toolsMeta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.mcp) wires.mcp = {}
    if (!wires.mcp.tool) wires.mcp.tool = []
    wires.mcp.tool.push({
      name: meta.name,
      startNode: resolveStartNode(parsed, graph),
    })
  }

  for (const meta of Object.values(state.mcpEndpoints.promptsMeta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.mcp) wires.mcp = {}
    if (!wires.mcp.prompt) wires.mcp.prompt = []
    wires.mcp.prompt.push({
      name: meta.name,
      startNode: resolveStartNode(parsed, graph),
    })
  }

  for (const meta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    const parsed = parseWorkflowFuncId(meta.pikkuFuncId)
    if (!parsed) continue
    const graph = graphMeta[parsed.workflowName]
    if (!graph) continue
    const wires = getOrCreateWires(graph)
    if (!wires.mcp) wires.mcp = {}
    if (!wires.mcp.resource) wires.mcp.resource = []
    wires.mcp.resource.push({
      uri: meta.uri,
      startNode: resolveStartNode(parsed, graph),
    })
  }
}

function visitCLICommands(
  commands: Record<string, CLICommandMeta>,
  programName: string,
  path: string[],
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const [name, command] of Object.entries(commands)) {
    const currentPath = [...path, name]
    const parsed = parseWorkflowFuncId(command.pikkuFuncId)
    if (parsed) {
      const graph = graphMeta[parsed.workflowName]
      if (graph) {
        const wires = getOrCreateWires(graph)
        if (!wires.cli) wires.cli = []
        wires.cli.push({
          command: `${programName} ${currentPath.join(' ')}`,
          startNode: resolveStartNode(parsed, graph),
        })
      }
    }
    if (command.subcommands) {
      visitCLICommands(command.subcommands, programName, currentPath, graphMeta)
    }
  }
}

function scanCLI(
  state: InspectorState,
  graphMeta: Record<string, SerializedWorkflowGraph>
): void {
  for (const program of Object.values(state.cli.meta.programs)) {
    visitCLICommands(program.commands, program.program, [], graphMeta)
  }
}
