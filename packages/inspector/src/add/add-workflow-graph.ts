import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractStringLiteral } from '../utils/extract-node-value.js'
import type {
  SerializedWorkflowGraph,
  DataRef,
} from '../utils/workflow/graph/workflow-graph.types.js'

function extractAstValue(
  expr: ts.Expression,
  refParamName: string,
  templateParamName: string | undefined
): unknown {
  if (ts.isStringLiteral(expr)) {
    return expr.text
  }
  if (ts.isNumericLiteral(expr)) {
    return Number(expr.text)
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression
    if (ts.isIdentifier(callee)) {
      if (callee.text === refParamName) {
        const args = expr.arguments
        const nodeId =
          args[0] && ts.isStringLiteral(args[0]) ? args[0].text : 'unknown'
        const path =
          args[1] && ts.isStringLiteral(args[1]) ? args[1].text : undefined
        return { $ref: nodeId, path } as DataRef
      }
      if (templateParamName && callee.text === templateParamName) {
        const templateStr =
          expr.arguments[0] && ts.isStringLiteral(expr.arguments[0])
            ? expr.arguments[0].text
            : ''
        const refsArg = expr.arguments[1]
        const refs: Array<{ $ref: string; path?: string }> = []
        if (refsArg && ts.isArrayLiteralExpression(refsArg)) {
          for (const el of refsArg.elements) {
            const resolved = extractAstValue(
              el,
              refParamName,
              templateParamName
            )
            if (
              typeof resolved === 'object' &&
              resolved !== null &&
              '$ref' in resolved
            ) {
              refs.push(resolved as { $ref: string; path?: string })
            }
          }
        }
        const parts: string[] = []
        const expressions: Array<{ $ref: string; path?: string }> = []
        const regex = /\$(\d+)/g
        let lastIndex = 0
        let match
        while ((match = regex.exec(templateStr)) !== null) {
          parts.push(templateStr.slice(lastIndex, match.index))
          const refIndex = parseInt(match[1]!, 10)
          expressions.push(refs[refIndex] ?? { $ref: 'unknown' })
          lastIndex = regex.lastIndex
        }
        parts.push(templateStr.slice(lastIndex))
        return { $template: { parts, expressions } }
      }
    }
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((el) =>
      extractAstValue(el, refParamName, templateParamName)
    )
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {}
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null
      if (!key) continue
      obj[key] = extractAstValue(
        prop.initializer,
        refParamName,
        templateParamName
      )
    }
    return obj
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    if (
      expr.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(expr.operand)
    ) {
      return -Number(expr.operand.text)
    }
  }
  return undefined
}

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

  const templateParamName =
    node.parameters.length > 1 && ts.isIdentifier(node.parameters[1].name)
      ? node.parameters[1].name.text
      : undefined

  const input: Record<string, unknown | DataRef> = {}

  for (const prop of bodyObj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const key = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null

    if (!key) continue

    const value = extractAstValue(
      prop.initializer,
      refParamName,
      templateParamName
    )
    if (value !== undefined) {
      input[key] = value
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
 * Extract pikkuWorkflowGraph config from an object literal argument
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
 * Inspector for pikkuWorkflowGraph() calls
 * Detects: pikkuWorkflowGraph({ nodes: {...}, config: {...} })
 * or: export const x = pikkuWorkflowGraph({...}) where the call is found via variable declaration
 */
export const addWorkflowGraph: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (
    !ts.isIdentifier(expression) ||
    expression.text !== 'pikkuWorkflowGraph'
  ) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]

  if (!firstArg) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'pikkuWorkflowGraph requires an argument'
    )
    return
  }

  if (!ts.isObjectLiteralExpression(firstArg)) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      'pikkuWorkflowGraph requires an object argument'
    )
    return
  }

  const graphConfig = extractWorkflowGraphConfig(firstArg, checker)

  if (!graphConfig) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'pikkuWorkflowGraph: failed to extract config'
    )
    return
  }

  // Resolve exportedName from variable declaration if this is `export const x = pikkuWorkflowGraph({...})`
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
      'pikkuWorkflowGraph requires a name property or exported variable name'
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
    pikkuFuncId: workflowName,
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
