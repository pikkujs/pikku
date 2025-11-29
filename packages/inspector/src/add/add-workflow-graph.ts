import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractStringLiteral } from '../utils/extract-node-value.js'
import type {
  SerializedWorkflowGraph,
  DataRef,
  WorkflowWires,
} from '../utils/workflow/graph/workflow-graph.types.js'

/**
 * Extract wire configuration from object literal
 */
function extractWires(
  wiresNode: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): WorkflowWires {
  const wires: WorkflowWires = {}

  for (const prop of wiresNode.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'http' && ts.isObjectLiteralExpression(prop.initializer)) {
      const httpWire: { route?: string; method?: string } = {}

      for (const httpProp of prop.initializer.properties) {
        if (
          !ts.isPropertyAssignment(httpProp) ||
          !ts.isIdentifier(httpProp.name)
        )
          continue

        if (httpProp.name.text === 'route') {
          httpWire.route = extractStringLiteral(httpProp.initializer, checker)
        } else if (httpProp.name.text === 'method') {
          httpWire.method = extractStringLiteral(httpProp.initializer, checker)
        }
      }

      if (httpWire.route && httpWire.method) {
        wires.http = httpWire as WorkflowWires['http']
      }
    } else if (propName === 'queue') {
      wires.queue = extractStringLiteral(prop.initializer, checker)
    } else if (propName === 'schedule') {
      wires.schedule = extractStringLiteral(prop.initializer, checker)
    }
  }

  return wires
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
 * Extract node config from a call expression
 */
function extractNodeFromCall(
  callExpr: ts.CallExpression,
  checker: ts.TypeChecker
): {
  rpcName: string
  input: Record<string, any>
  next: any
  onError: any
} | null {
  const args = callExpr.arguments
  const configArg = args[0]

  if (configArg && ts.isObjectLiteralExpression(configArg)) {
    return extractNodeFromObject(configArg, checker)
  }

  return null
}

/**
 * Extract node config from an object literal
 */
function extractNodeFromObject(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): {
  rpcName: string
  input: Record<string, any>
  next: any
  onError: any
} | null {
  let rpcName = 'unknown'
  let input: Record<string, any> = {}
  let next: any = undefined
  let onError: any = undefined

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'func') {
      const funcValue = extractStringLiteral(prop.initializer, checker)
      if (funcValue) {
        rpcName = funcValue
      }
    } else if (propName === 'next') {
      next = extractNextConfig(prop.initializer, checker)
    } else if (propName === 'onError') {
      onError = extractNextConfig(prop.initializer, checker)
    } else if (propName === 'input') {
      input = extractInputMapping(prop.initializer, checker)
    }
  }

  return { rpcName, input, next, onError }
}

/**
 * Extract graph nodes from object literal
 */
function extractGraphNodes(
  graphObj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  state: any
): {
  nodes: Record<string, any>
  rpcNames: Set<string>
} {
  const nodes: Record<string, any> = {}
  const rpcNames = new Set<string>()

  for (const prop of graphObj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const nodeId = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null

    if (!nodeId) continue

    let nodeConfig: {
      rpcName: string
      input: Record<string, any>
      next: any
      onError: any
    } | null = null

    if (ts.isCallExpression(prop.initializer)) {
      const expr = prop.initializer.expression
      if (
        ts.isIdentifier(expr) &&
        (expr.text === 'graphNode' || expr.text === 'node')
      ) {
        nodeConfig = extractNodeFromCall(prop.initializer, checker)
      }
    } else if (ts.isObjectLiteralExpression(prop.initializer)) {
      nodeConfig = extractNodeFromObject(prop.initializer, checker)
    }

    if (nodeConfig) {
      rpcNames.add(nodeConfig.rpcName)
      state.rpc.invokedFunctions.add(nodeConfig.rpcName)

      nodes[nodeId] = {
        nodeId,
        rpcName: nodeConfig.rpcName,
        input: nodeConfig.input,
        next: nodeConfig.next,
        onError: nodeConfig.onError,
      }
    }
  }

  return { nodes, rpcNames }
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

/**
 * Extract pikkuWorkflowGraph config from a variable reference or call expression
 * Returns { name, description, tags, graphConfigNode } where graphConfigNode is the graph callback's object
 */
function extractPikkuWorkflowGraphConfig(
  node: ts.Node,
  checker: ts.TypeChecker
):
  | {
      name?: string
      description?: string
      tags?: string[]
      graphConfigNode?: ts.Node
    }
  | undefined {
  // If it's an identifier, resolve to the declaration
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol) {
      const declarations = symbol.getDeclarations()
      if (declarations && declarations.length > 0) {
        const decl = declarations[0]
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          return extractPikkuWorkflowGraphConfig(decl.initializer, checker)
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
        let graphConfigNode: ts.Node | undefined

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
          } else if (propName === 'graph') {
            // The graph property is a callback: (graph) => graph({...})({...})
            graphConfigNode = prop.initializer
          }
        }

        return { name, description, tags, graphConfigNode }
      }
    }
  }

  return undefined
}

/**
 * Extract graph nodes from a pikkuWorkflowGraph graph callback
 * The callback is: (graph) => graph({ entry: 'rpc1', ... })({ entry: { next: ... }, ... })
 */
function extractGraphFromCallback(
  callbackNode: ts.Node,
  checker: ts.TypeChecker,
  state: any
): Record<string, any> {
  if (!ts.isArrowFunction(callbackNode)) {
    return {}
  }

  const body = callbackNode.body

  // The body should be a call expression: graph({...})({...})
  let resultCall: ts.CallExpression | undefined

  if (ts.isCallExpression(body)) {
    resultCall = body
  } else if (
    ts.isParenthesizedExpression(body) &&
    ts.isCallExpression(body.expression)
  ) {
    resultCall = body.expression
  }

  if (!resultCall) {
    return {}
  }

  // This is the second call in curried pattern: graph({funcMap})({nodeConfig})
  // The argument is the node config object
  const nodeConfigArg = resultCall.arguments[0]
  if (nodeConfigArg) {
    if (ts.isObjectLiteralExpression(nodeConfigArg)) {
      const result = extractGraphNodes(nodeConfigArg, checker, state)
      return result.nodes
    }
    if (ts.isArrowFunction(nodeConfigArg)) {
      // Handle callback pattern: graph({...})((nodes) => ({...}))
      const callbackBody = nodeConfigArg.body
      if (ts.isObjectLiteralExpression(callbackBody)) {
        const result = extractGraphNodes(callbackBody, checker, state)
        return result.nodes
      }
      if (
        ts.isParenthesizedExpression(callbackBody) &&
        ts.isObjectLiteralExpression(callbackBody.expression)
      ) {
        const result = extractGraphNodes(
          callbackBody.expression,
          checker,
          state
        )
        return result.nodes
      }
    }
  }

  return {}
}

/**
 * Inspector for wireWorkflow() calls with graph definitions
 * Detects: wireWorkflow({ wires: {...}, graph: pikkuWorkflowGraphResult })
 */
export const addWorkflowGraph: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wireWorkflow') {
    return
  }

  const args = node.arguments
  const firstArg = args[0]

  if (!firstArg) {
    logger.critical(ErrorCode.MISSING_FUNC, 'wireWorkflow requires an argument')
    return
  }

  const definitionObj = extractDefinitionObject(firstArg)

  if (!definitionObj) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflow requires an object argument'
    )
    return
  }

  // Check if this is a graph workflow (has 'graph' property)
  let graphPropNode: ts.Node | undefined
  let wires: WorkflowWires = {}

  for (const prop of definitionObj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text
    if (propName === 'graph') {
      graphPropNode = prop.initializer
    } else if (
      propName === 'wires' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      wires = extractWires(prop.initializer, checker)
    }
  }

  // If no graph property, this is a DSL workflow - skip (handled by add-workflow.ts)
  if (!graphPropNode) {
    return
  }

  // Extract config from the pikkuWorkflowGraph result
  const graphConfig = extractPikkuWorkflowGraphConfig(graphPropNode, checker)

  if (!graphConfig || !graphConfig.name) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflow with graph requires a pikkuWorkflowGraph with a name property'
    )
    return
  }

  // Extract graph nodes from the graph callback
  let graphNodes: Record<string, any> = {}
  if (graphConfig.graphConfigNode) {
    graphNodes = extractGraphFromCallback(
      graphConfig.graphConfigNode,
      checker,
      state
    )
  }

  const entryNodeIds = computeEntryNodeIds(graphNodes)

  const serialized: SerializedWorkflowGraph = {
    name: graphConfig.name,
    pikkuFuncName: graphConfig.name,
    source: 'graph',
    description: graphConfig.description,
    tags: graphConfig.tags,
    wires,
    nodes: graphNodes,
    entryNodeIds,
  }

  state.workflows.graphMeta[graphConfig.name] = serialized
  state.workflows.graphFiles.add(node.getSourceFile().fileName)
}
