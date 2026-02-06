import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractStringLiteral } from '../utils/extract-node-value.js'
import type {
  SerializedWorkflowGraph,
  DataRef,
} from '../utils/workflow/graph/workflow-graph.types.js'

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
  disabled?: true
  nodesNode?: ts.ObjectLiteralExpression
  configNode?: ts.ObjectLiteralExpression
  exportedName?: string
}

/**
 * Extract wireWorkflowGraph config from an object literal argument
 */
function extractWorkflowGraphConfig(
  configArg: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): PikkuWorkflowGraphExtract | undefined {
  let name: string | undefined
  let description: string | undefined
  let tags: string[] | undefined
  let disabled: true | undefined
  let nodesNode: ts.ObjectLiteralExpression | undefined
  let configNode: ts.ObjectLiteralExpression | undefined

  for (const prop of configArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text
    if (propName === 'name') {
      name = extractStringLiteral(prop.initializer, checker)
    } else if (propName === 'description') {
      description = extractStringLiteral(prop.initializer, checker)
    } else if (propName === 'disabled') {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        disabled = true
      }
    } else if (
      propName === 'tags' &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      tags = prop.initializer.elements
        .filter(ts.isStringLiteral)
        .map((el) => (el as ts.StringLiteral).text)
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

  return { name, description, tags, disabled, nodesNode, configNode }
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
 * Inspector for wireWorkflowGraph() calls
 * Detects: wireWorkflowGraph({ nodes: {...}, config: {...} })
 * or: export const x = wireWorkflowGraph({...}) where the call is found via variable declaration
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

  if (!ts.isObjectLiteralExpression(firstArg)) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'wireWorkflowGraph requires an object argument'
    )
    return
  }

  const graphConfig = extractWorkflowGraphConfig(firstArg, checker)

  if (!graphConfig) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflowGraph: failed to extract config'
    )
    return
  }

  // Resolve exportedName from variable declaration if this is `export const x = wireWorkflowGraph({...})`
  const parent = node.parent
  if (
    !graphConfig.exportedName &&
    parent &&
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name)
  ) {
    graphConfig.exportedName = parent.name.text
  }

  const workflowName = graphConfig.name || graphConfig.exportedName

  if (!workflowName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireWorkflowGraph requires a name property or exported variable name'
    )
    return
  }

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

  const serialized: SerializedWorkflowGraph = {
    name: workflowName,
    pikkuFuncName: workflowName,
    source: 'graph',
    description: graphConfig.description,
    tags: graphConfig.tags,
    nodes: graphNodes,
    entryNodeIds,
  }

  if (graphConfig.disabled) return

  state.workflows.graphMeta[workflowName] = serialized
  state.workflows.graphFiles.set(workflowName, {
    path: node.getSourceFile().fileName,
    exportedName: graphConfig.exportedName || workflowName,
  })
}
