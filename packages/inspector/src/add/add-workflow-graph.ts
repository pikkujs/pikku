import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractStringLiteral } from '../utils/extract-node-value.js'
import type {
  SerializedWorkflowGraph,
  DataRef,
  WorkflowWiresConfig,
  HttpWire,
  ChannelWire,
  QueueWire,
  CliWire,
  McpWires,
  ScheduleWire,
  TriggerWire,
} from '../utils/workflow/graph/workflow-graph.types.js'

/**
 * Extract wire configuration from object literal
 */
function extractWiresConfig(
  wiresNode: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): WorkflowWiresConfig {
  const wires: WorkflowWiresConfig = {}

  for (const prop of wiresNode.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'http' && ts.isArrayLiteralExpression(prop.initializer)) {
      wires.http = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const httpWire: Partial<HttpWire> = {}
          for (const httpProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(httpProp) ||
              !ts.isIdentifier(httpProp.name)
            )
              continue
            const httpPropName = httpProp.name.text
            if (httpPropName === 'route') {
              httpWire.route = extractStringLiteral(
                httpProp.initializer,
                checker
              )
            } else if (httpPropName === 'method') {
              httpWire.method = extractStringLiteral(
                httpProp.initializer,
                checker
              ) as HttpWire['method']
            } else if (httpPropName === 'startNode') {
              httpWire.startNode = extractStringLiteral(
                httpProp.initializer,
                checker
              )
            }
          }
          if (httpWire.route && httpWire.method && httpWire.startNode) {
            wires.http.push(httpWire as HttpWire)
          }
        }
      }
    } else if (
      propName === 'channel' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      wires.channel = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const channelWire: Partial<ChannelWire> = {}
          for (const channelProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(channelProp) ||
              !ts.isIdentifier(channelProp.name)
            )
              continue
            const channelPropName = channelProp.name.text
            if (channelPropName === 'name') {
              channelWire.name = extractStringLiteral(
                channelProp.initializer,
                checker
              )
            } else if (channelPropName === 'onConnect') {
              channelWire.onConnect = extractStringLiteral(
                channelProp.initializer,
                checker
              )
            } else if (channelPropName === 'onDisconnect') {
              channelWire.onDisconnect = extractStringLiteral(
                channelProp.initializer,
                checker
              )
            } else if (channelPropName === 'onMessage') {
              channelWire.onMessage = extractStringLiteral(
                channelProp.initializer,
                checker
              )
            }
          }
          if (channelWire.name) {
            wires.channel.push(channelWire as ChannelWire)
          }
        }
      }
    } else if (
      propName === 'queue' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      wires.queue = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const queueWire: Partial<QueueWire> = {}
          for (const queueProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(queueProp) ||
              !ts.isIdentifier(queueProp.name)
            )
              continue
            const queuePropName = queueProp.name.text
            if (queuePropName === 'name') {
              queueWire.name = extractStringLiteral(
                queueProp.initializer,
                checker
              )
            } else if (queuePropName === 'startNode') {
              queueWire.startNode = extractStringLiteral(
                queueProp.initializer,
                checker
              )
            }
          }
          if (queueWire.name && queueWire.startNode) {
            wires.queue.push(queueWire as QueueWire)
          }
        }
      }
    } else if (
      propName === 'cli' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      wires.cli = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const cliWire: Partial<CliWire> = {}
          for (const cliProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(cliProp) ||
              !ts.isIdentifier(cliProp.name)
            )
              continue
            const cliPropName = cliProp.name.text
            if (cliPropName === 'command') {
              cliWire.command = extractStringLiteral(
                cliProp.initializer,
                checker
              )
            } else if (cliPropName === 'startNode') {
              cliWire.startNode = extractStringLiteral(
                cliProp.initializer,
                checker
              )
            }
          }
          if (cliWire.command && cliWire.startNode) {
            wires.cli.push(cliWire as CliWire)
          }
        }
      }
    } else if (
      propName === 'mcp' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      const mcpWires: McpWires = {}
      for (const mcpProp of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(mcpProp) || !ts.isIdentifier(mcpProp.name))
          continue
        const mcpPropName = mcpProp.name.text
        if (
          mcpPropName === 'tool' &&
          ts.isArrayLiteralExpression(mcpProp.initializer)
        ) {
          mcpWires.tool = extractMcpToolWireArray(mcpProp.initializer, checker)
        } else if (
          mcpPropName === 'prompt' &&
          ts.isArrayLiteralExpression(mcpProp.initializer)
        ) {
          mcpWires.prompt = extractMcpToolWireArray(
            mcpProp.initializer,
            checker
          )
        } else if (
          mcpPropName === 'resource' &&
          ts.isArrayLiteralExpression(mcpProp.initializer)
        ) {
          mcpWires.resource = extractMcpResourceWireArray(
            mcpProp.initializer,
            checker
          )
        }
      }
      if (mcpWires.tool || mcpWires.prompt || mcpWires.resource) {
        wires.mcp = mcpWires
      }
    } else if (
      propName === 'schedule' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      wires.schedule = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const scheduleWire: Partial<ScheduleWire> = {}
          for (const scheduleProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(scheduleProp) ||
              !ts.isIdentifier(scheduleProp.name)
            )
              continue
            const schedulePropName = scheduleProp.name.text
            if (schedulePropName === 'cron') {
              scheduleWire.cron = extractStringLiteral(
                scheduleProp.initializer,
                checker
              )
            } else if (schedulePropName === 'interval') {
              scheduleWire.interval = extractStringLiteral(
                scheduleProp.initializer,
                checker
              )
            } else if (schedulePropName === 'startNode') {
              scheduleWire.startNode = extractStringLiteral(
                scheduleProp.initializer,
                checker
              )
            }
          }
          if (
            (scheduleWire.cron || scheduleWire.interval) &&
            scheduleWire.startNode
          ) {
            wires.schedule.push(scheduleWire as ScheduleWire)
          }
        }
      }
    } else if (
      propName === 'trigger' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      wires.trigger = []
      for (const elem of prop.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const triggerWire: Partial<TriggerWire> = {}
          for (const triggerProp of elem.properties) {
            if (
              !ts.isPropertyAssignment(triggerProp) ||
              !ts.isIdentifier(triggerProp.name)
            )
              continue
            const triggerPropName = triggerProp.name.text
            if (triggerPropName === 'name') {
              triggerWire.name = extractStringLiteral(
                triggerProp.initializer,
                checker
              )
            } else if (triggerPropName === 'startNode') {
              triggerWire.startNode = extractStringLiteral(
                triggerProp.initializer,
                checker
              )
            }
          }
          if (triggerWire.name && triggerWire.startNode) {
            wires.trigger.push(triggerWire as TriggerWire)
          }
        }
      }
    }
  }

  return wires
}

/**
 * Helper to extract MCP wire arrays for tool/prompt (name field)
 */
function extractMcpToolWireArray(
  arrayNode: ts.ArrayLiteralExpression,
  checker: ts.TypeChecker
): Array<{ name: string; startNode: string }> {
  const result: Array<{ name: string; startNode: string }> = []
  for (const elem of arrayNode.elements) {
    if (ts.isObjectLiteralExpression(elem)) {
      let name: string | undefined
      let startNode: string | undefined
      for (const prop of elem.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
          continue
        const propName = prop.name.text
        if (propName === 'name') {
          name = extractStringLiteral(prop.initializer, checker)
        } else if (propName === 'startNode') {
          startNode = extractStringLiteral(prop.initializer, checker)
        }
      }
      if (name && startNode) {
        result.push({ name, startNode })
      }
    }
  }
  return result
}

/**
 * Helper to extract MCP wire arrays for resource (uri field)
 */
function extractMcpResourceWireArray(
  arrayNode: ts.ArrayLiteralExpression,
  checker: ts.TypeChecker
): Array<{ uri: string; startNode: string }> {
  const result: Array<{ uri: string; startNode: string }> = []
  for (const elem of arrayNode.elements) {
    if (ts.isObjectLiteralExpression(elem)) {
      let uri: string | undefined
      let startNode: string | undefined
      for (const prop of elem.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
          continue
        const propName = prop.name.text
        if (propName === 'uri') {
          uri = extractStringLiteral(prop.initializer, checker)
        } else if (propName === 'startNode') {
          startNode = extractStringLiteral(prop.initializer, checker)
        }
      }
      if (uri && startNode) {
        result.push({ uri, startNode })
      }
    }
  }
  return result
}

/**
 * Extract input mapping from an arrow function
 * Parses: (ref) => ({ key: ref('nodeId', 'path'), key2: 'literal' })
 */
function extractInputMapping(
  node: ts.Node,
  _checker: ts.TypeChecker
): Record<string, unknown | DataRef> {
  if (!ts.isArrowFunction(node)) {
    return {}
  }

  let bodyObj: ts.ObjectLiteralExpression | undefined

  if (ts.isObjectLiteralExpression(node.body)) {
    bodyObj = node.body
  } else if (ts.isParenthesizedExpression(node.body)) {
    if (ts.isObjectLiteralExpression(node.body.expression)) {
      bodyObj = node.body.expression
    }
  } else if (ts.isBlock(node.body)) {
    for (const stmt of node.body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        if (ts.isObjectLiteralExpression(stmt.expression)) {
          bodyObj = stmt.expression
        }
      }
    }
  }

  if (!bodyObj) {
    return {}
  }

  const refParamName =
    node.parameters.length > 0 && ts.isIdentifier(node.parameters[0].name)
      ? node.parameters[0].name.text
      : 'ref'

  const input: Record<string, unknown | DataRef> = {}

  for (const prop of bodyObj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const key = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null

    if (!key) continue

    if (ts.isCallExpression(prop.initializer)) {
      const callExpr = prop.initializer.expression
      if (ts.isIdentifier(callExpr) && callExpr.text === refParamName) {
        const args = prop.initializer.arguments
        const nodeIdArg = args[0]
        const pathArg = args[1]

        const nodeId =
          nodeIdArg && ts.isStringLiteral(nodeIdArg)
            ? nodeIdArg.text
            : 'unknown'
        const path =
          pathArg && ts.isStringLiteral(pathArg) ? pathArg.text : undefined

        input[key] = { $ref: nodeId, path } as DataRef
        continue
      }
    }

    if (ts.isStringLiteral(prop.initializer)) {
      input[key] = prop.initializer.text
    } else if (ts.isNumericLiteral(prop.initializer)) {
      input[key] = Number(prop.initializer.text)
    } else if (
      prop.initializer.kind === ts.SyntaxKind.TrueKeyword ||
      prop.initializer.kind === ts.SyntaxKind.FalseKeyword
    ) {
      input[key] = prop.initializer.kind === ts.SyntaxKind.TrueKeyword
    } else if (prop.initializer.kind === ts.SyntaxKind.NullKeyword) {
      input[key] = null
    }
  }

  return input
}

/**
 * Extract next config (string, array, or record)
 */
function extractNextConfig(
  node: ts.Node,
  _checker: ts.TypeChecker
): string | string[] | Record<string, string | string[]> | undefined {
  if (ts.isStringLiteral(node)) {
    return node.text
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements
      .filter(ts.isStringLiteral)
      .map((el) => (el as ts.StringLiteral).text)
  }

  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, string | string[]> = {}
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue

      const key = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null

      if (!key) continue

      if (ts.isStringLiteral(prop.initializer)) {
        result[key] = prop.initializer.text
      } else if (ts.isArrayLiteralExpression(prop.initializer)) {
        result[key] = prop.initializer.elements
          .filter(ts.isStringLiteral)
          .map((el) => (el as ts.StringLiteral).text)
      }
    }
    return result
  }

  return undefined
}

/**
 * Extract definition object from wireWorkflow call
 */
function extractDefinitionObject(
  firstArg: ts.Node
): ts.ObjectLiteralExpression | undefined {
  if (ts.isObjectLiteralExpression(firstArg)) {
    return firstArg
  }

  if (ts.isArrowFunction(firstArg)) {
    const body = firstArg.body

    if (ts.isObjectLiteralExpression(body)) {
      return body
    }

    if (ts.isParenthesizedExpression(body)) {
      if (ts.isObjectLiteralExpression(body.expression)) {
        return body.expression
      }
    }

    if (ts.isBlock(body)) {
      for (const stmt of body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression) {
          if (ts.isObjectLiteralExpression(stmt.expression)) {
            return stmt.expression
          }
        }
      }
    }
  }

  return undefined
}

/**
 * Compute entry node IDs from graph nodes
 */
function computeEntryNodeIds(graphNodes: Record<string, any>): string[] {
  const hasIncomingEdge = new Set<string>()
  for (const node of Object.values(graphNodes)) {
    const next = node.next
    if (!next) continue

    if (typeof next === 'string') {
      hasIncomingEdge.add(next)
    } else if (Array.isArray(next)) {
      next.forEach((n: string) => hasIncomingEdge.add(n))
    } else if (typeof next === 'object') {
      for (const targets of Object.values(next)) {
        if (typeof targets === 'string') {
          hasIncomingEdge.add(targets)
        } else if (Array.isArray(targets)) {
          ;(targets as string[]).forEach((n) => hasIncomingEdge.add(n))
        }
      }
    }
  }

  return Object.keys(graphNodes).filter(
    (nodeId) => !hasIncomingEdge.has(nodeId)
  )
}

interface PikkuWorkflowGraphExtract {
  name?: string
  description?: string
  tags?: string[]
  wires?: WorkflowWiresConfig
  nodesNode?: ts.ObjectLiteralExpression // The nodes: { entry: 'rpc1', ... } object
  configNode?: ts.ObjectLiteralExpression // The config: { entry: { next: ... }, ... } object
  exportedName?: string
}

/**
 * Extract pikkuWorkflowGraph config from a variable reference or call expression
 * New format: pikkuWorkflowGraph({ nodes: {...}, wires: {...}, config: {...} })
 */
function extractPikkuWorkflowGraphConfig(
  node: ts.Node,
  checker: ts.TypeChecker
): PikkuWorkflowGraphExtract | undefined {
  // If it's an identifier, resolve to the declaration
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol) {
      const declarations = symbol.getDeclarations()
      if (declarations && declarations.length > 0) {
        const decl = declarations[0]
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          const result = extractPikkuWorkflowGraphConfig(
            decl.initializer,
            checker
          )
          if (result) {
            // Use the variable name as exportedName
            result.exportedName = ts.isIdentifier(decl.name)
              ? decl.name.text
              : undefined
          }
          return result
        }
      }
    }
    return undefined
  }

  // If it's a call expression to pikkuWorkflowGraph
  if (ts.isCallExpression(node)) {
    const expr = node.expression
    if (ts.isIdentifier(expr) && expr.text === 'pikkuWorkflowGraph') {
      const configArg = node.arguments[0]
      if (configArg && ts.isObjectLiteralExpression(configArg)) {
        let name: string | undefined
        let description: string | undefined
        let tags: string[] | undefined
        let wires: WorkflowWiresConfig | undefined
        let nodesNode: ts.ObjectLiteralExpression | undefined
        let configNode: ts.ObjectLiteralExpression | undefined

        for (const prop of configArg.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
            continue

          const propName = prop.name.text
          if (propName === 'name') {
            name = extractStringLiteral(prop.initializer, checker)
          } else if (propName === 'description') {
            description = extractStringLiteral(prop.initializer, checker)
          } else if (
            propName === 'tags' &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            tags = prop.initializer.elements
              .filter(ts.isStringLiteral)
              .map((el) => (el as ts.StringLiteral).text)
          } else if (
            propName === 'wires' &&
            ts.isObjectLiteralExpression(prop.initializer)
          ) {
            wires = extractWiresConfig(prop.initializer, checker)
          } else if (
            propName === 'nodes' &&
            ts.isObjectLiteralExpression(prop.initializer)
          ) {
            nodesNode = prop.initializer
          } else if (
            propName === 'config' &&
            ts.isObjectLiteralExpression(prop.initializer)
          ) {
            configNode = prop.initializer
          }
        }

        return { name, description, tags, wires, nodesNode, configNode }
      }
    }
  }

  return undefined
}

/**
 * Extract graph nodes from the new pikkuWorkflowGraph format
 * New format: { nodes: { entry: 'rpcName', ... }, config: { entry: { next: 'sendWelcome', ... }, ... } }
 */
function extractGraphFromNewFormat(
  nodesNode: ts.ObjectLiteralExpression | undefined,
  configNode: ts.ObjectLiteralExpression | undefined,
  checker: ts.TypeChecker,
  state: any
): Record<string, any> {
  const nodes: Record<string, any> = {}

  if (!nodesNode) {
    return nodes
  }

  // Extract node ID to RPC name mapping from 'nodes' property
  const nodeRpcMap: Record<string, string> = {}
  for (const prop of nodesNode.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const nodeId = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null

    if (!nodeId) continue

    const rpcName = extractStringLiteral(prop.initializer, checker)
    if (rpcName) {
      nodeRpcMap[nodeId] = rpcName
      state.rpc.invokedFunctions.add(rpcName)
      const funcFile = state.functions.files.get(rpcName)
      if (funcFile && !state.rpc.internalFiles.has(rpcName)) {
        state.rpc.internalFiles.set(rpcName, funcFile)
      }
    }
  }

  // Initialize nodes with their RPC names
  for (const [nodeId, rpcName] of Object.entries(nodeRpcMap)) {
    nodes[nodeId] = {
      nodeId,
      rpcName,
      input: {},
      next: undefined,
      onError: undefined,
    }
  }

  // Extract config for each node from 'config' property
  if (configNode) {
    for (const prop of configNode.properties) {
      if (!ts.isPropertyAssignment(prop)) continue

      const nodeId = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null

      if (!nodeId || !nodes[nodeId]) continue

      if (ts.isObjectLiteralExpression(prop.initializer)) {
        const nodeConfig = extractNodeConfigFromObject(
          prop.initializer,
          checker
        )
        if (nodeConfig) {
          nodes[nodeId].next = nodeConfig.next
          nodes[nodeId].onError = nodeConfig.onError
          nodes[nodeId].input = nodeConfig.input
        }
      }
    }
  }

  return nodes
}

/**
 * Extract node config (next, onError, input) from object literal
 */
function extractNodeConfigFromObject(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): {
  next: any
  onError: any
  input: Record<string, any>
} {
  let next: any = undefined
  let onError: any = undefined
  let input: Record<string, any> = {}

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'next') {
      next = extractNextConfig(prop.initializer, checker)
    } else if (propName === 'onError') {
      onError = extractNextConfig(prop.initializer, checker)
    } else if (propName === 'input') {
      input = extractInputMapping(prop.initializer, checker)
    }
  }

  return { next, onError, input }
}

/**
 * Inspector for wireWorkflowGraph() calls with graph definitions
 * Detects: wireWorkflowGraph({ graph: pikkuWorkflowGraphResult })
 */
export const addWorkflowGraph: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wireWorkflowGraph') {
    return
  }

  const args = node.arguments
  const firstArg = args[0]

  if (!firstArg) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflowGraph requires an argument'
    )
    return
  }

  const definitionObj = extractDefinitionObject(firstArg)

  if (!definitionObj) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflowGraph requires an object argument'
    )
    return
  }

  let graphPropNode: ts.Node | undefined
  let enabled = true

  for (const prop of definitionObj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text
    if (propName === 'graph') {
      graphPropNode = prop.initializer
    } else if (propName === 'enabled') {
      if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        enabled = false
      }
    }
  }

  if (!graphPropNode) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflowGraph requires a graph property'
    )
    return
  }

  // Extract config from the pikkuWorkflowGraph result
  const graphConfig = extractPikkuWorkflowGraphConfig(graphPropNode, checker)

  if (!graphConfig) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflowGraph requires a pikkuWorkflowGraph'
    )
    return
  }

  // Use explicit name or fall back to exported variable name
  const workflowName = graphConfig.name || graphConfig.exportedName

  if (!workflowName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflowGraph requires a pikkuWorkflowGraph with a name property or exported variable name'
    )
    return
  }

  // Extract graph nodes from the new format (nodes + config properties)
  let graphNodes: Record<string, any> = {}
  if (graphConfig.nodesNode) {
    graphNodes = extractGraphFromNewFormat(
      graphConfig.nodesNode,
      graphConfig.configNode,
      checker,
      state
    )
  }

  const entryNodeIds = computeEntryNodeIds(graphNodes)

  // Use wires from pikkuWorkflowGraph (not from wireWorkflow)
  const wires = graphConfig.wires || {}

  const serialized: SerializedWorkflowGraph = {
    name: workflowName,
    pikkuFuncName: workflowName,
    source: 'graph',
    description: graphConfig.description,
    tags: graphConfig.tags,
    wires,
    nodes: graphNodes,
    entryNodeIds,
  }

  // Only add if enabled (or not explicitly disabled)
  if (enabled) {
    state.workflows.graphMeta[workflowName] = serialized
    // Store file path and exported name for import generation
    state.workflows.graphFiles.set(workflowName, {
      path: node.getSourceFile().fileName,
      exportedName: graphConfig.exportedName || workflowName,
    })
  }
}
