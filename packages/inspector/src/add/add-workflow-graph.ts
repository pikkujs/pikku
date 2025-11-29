import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractStringLiteral } from '../utils/extract-node-value.js'
import type {
  SerializedWorkflowGraph,
  DataRef,
} from '../utils/workflow/graph/workflow-graph.types.js'

/**
 * Extract trigger configuration from object literal
 */
function extractTriggers(
  triggersNode: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): SerializedWorkflowGraph['triggers'] {
  const triggers: SerializedWorkflowGraph['triggers'] = {}

  for (const prop of triggersNode.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'http' && ts.isObjectLiteralExpression(prop.initializer)) {
      const httpTrigger: { route?: string; method?: string } = {}

      for (const httpProp of prop.initializer.properties) {
        if (
          !ts.isPropertyAssignment(httpProp) ||
          !ts.isIdentifier(httpProp.name)
        )
          continue

        if (httpProp.name.text === 'route') {
          httpTrigger.route = extractStringLiteral(
            httpProp.initializer,
            checker
          )
        } else if (httpProp.name.text === 'method') {
          httpTrigger.method = extractStringLiteral(
            httpProp.initializer,
            checker
          )
        }
      }

      if (httpTrigger.route && httpTrigger.method) {
        triggers.http =
          httpTrigger as SerializedWorkflowGraph['triggers']['http']
      }
    } else if (propName === 'queue') {
      triggers.queue = extractStringLiteral(prop.initializer, checker)
    } else if (propName === 'schedule') {
      triggers.schedule = extractStringLiteral(prop.initializer, checker)
    }
  }

  return triggers
}

/**
 * Extract input mapping from an arrow function
 * Parses: (ref) => ({ key: ref('nodeId', 'path'), key2: 'literal' })
 */
function extractInputMapping(
  node: ts.Node,
  _checker: ts.TypeChecker
): Record<string, unknown | DataRef> {
  // Must be an arrow function
  if (!ts.isArrowFunction(node)) {
    return {}
  }

  // Get the body - could be direct object literal or block with return
  let bodyObj: ts.ObjectLiteralExpression | undefined

  if (ts.isObjectLiteralExpression(node.body)) {
    // Direct: (ref) => ({ ... })
    bodyObj = node.body
  } else if (ts.isParenthesizedExpression(node.body)) {
    // Parenthesized: (ref) => ({ ... })
    if (ts.isObjectLiteralExpression(node.body.expression)) {
      bodyObj = node.body.expression
    }
  } else if (ts.isBlock(node.body)) {
    // Block with return: (ref) => { return { ... } }
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

  // Get the ref parameter name (usually 'ref')
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

    // Check if value is a ref() call
    if (ts.isCallExpression(prop.initializer)) {
      const callExpr = prop.initializer.expression
      if (ts.isIdentifier(callExpr) && callExpr.text === refParamName) {
        // It's a ref('nodeId', 'path') call
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

    // Otherwise extract as literal value
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
    // For complex values, we can't extract statically - skip or mark
  }

  return input
}

/**
 * Extract node config from a call expression like node({ func: 'external:...', ... })
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

  // First arg is the config object with func, next, input, onError
  const configArg = args[0]

  if (configArg && ts.isObjectLiteralExpression(configArg)) {
    return extractNodeFromObject(configArg, checker)
  }

  return null
}

/**
 * Extract node config from an object literal like { func: 'external:funcName', next: 'next', input: ... }
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
      // Handle string literal: func: 'rpcName'
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
      // Handle: node(func, config) or graphNode(func, config)
      const expr = prop.initializer.expression
      if (
        ts.isIdentifier(expr) &&
        (expr.text === 'graphNode' || expr.text === 'node')
      ) {
        nodeConfig = extractNodeFromCall(prop.initializer, checker)
      }
    } else if (ts.isObjectLiteralExpression(prop.initializer)) {
      // Handle: { func: myFunc, next: 'next', input: ... }
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
 * Inspector for wireWorkflowGraph() calls
 * Extracts workflow graph definitions and serializes them
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

  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflowGraph requires an object argument'
    )
    return
  }

  // Extract properties from the definition object
  let name: string | undefined
  let description: string | undefined
  let tags: string[] | undefined
  let triggers: SerializedWorkflowGraph['triggers'] = {}
  let graphNodes: Record<string, any> = {}

  for (const prop of firstArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

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
      propName === 'triggers' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      triggers = extractTriggers(prop.initializer, checker)
    } else if (propName === 'graph') {
      // Handle various graph patterns
      let graphObj: ts.ObjectLiteralExpression | undefined

      if (ts.isObjectLiteralExpression(prop.initializer)) {
        // Direct: graph: { entry: { func: ..., next: ... } }
        graphObj = prop.initializer
      } else if (ts.isCallExpression(prop.initializer)) {
        const callExpr = prop.initializer.expression
        // Check if it's graph() or graph<...>()
        const isGraphCall =
          (ts.isIdentifier(callExpr) && callExpr.text === 'graph') ||
          (ts.isExpressionWithTypeArguments(callExpr) &&
            ts.isIdentifier((callExpr as any).expression) &&
            (callExpr as any).expression.text === 'graph')

        if (isGraphCall) {
          const graphArg = prop.initializer.arguments[0]
          if (graphArg && ts.isObjectLiteralExpression(graphArg)) {
            // Old pattern: graph({ entry: { func: ... } })
            graphObj = graphArg
          } else if (graphArg && ts.isArrowFunction(graphArg)) {
            // New pattern: graph<...>((node) => ({ entry: node(...) }))
            const body = graphArg.body
            if (ts.isObjectLiteralExpression(body)) {
              graphObj = body
            } else if (ts.isParenthesizedExpression(body)) {
              if (ts.isObjectLiteralExpression(body.expression)) {
                graphObj = body.expression
              }
            } else if (ts.isBlock(body)) {
              // Handle: (node) => { return { ... } }
              for (const stmt of body.statements) {
                if (ts.isReturnStatement(stmt) && stmt.expression) {
                  if (ts.isObjectLiteralExpression(stmt.expression)) {
                    graphObj = stmt.expression
                  }
                }
              }
            }
          }
        }
      }

      if (graphObj) {
        const result = extractGraphNodes(graphObj, checker, state)
        graphNodes = result.nodes
      }
    }
  }

  if (!name) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflowGraph requires a name property'
    )
    return
  }

  // Find entry nodes (nodes with no incoming edges)
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

  const entryNodeIds = Object.keys(graphNodes).filter(
    (nodeId) => !hasIncomingEdge.has(nodeId)
  )

  // Store in state
  const serialized: SerializedWorkflowGraph = {
    name,
    pikkuFuncName: name, // For graph workflows, pikkuFuncName is the workflow name
    source: 'graph',
    description,
    tags,
    triggers,
    nodes: graphNodes,
    entryNodeIds,
  }

  // Add to workflows state
  state.workflows.graphMeta[name] = serialized
  state.workflows.graphFiles.add(node.getSourceFile().fileName)
}
