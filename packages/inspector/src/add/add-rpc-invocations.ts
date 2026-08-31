import * as ts from 'typescript'
import type { InspectorState, InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'

function hasTypeCast(node: ts.Node): boolean {
  return ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
}

function outerParent(node: ts.Node): ts.Node {
  let p = node.parent
  while (p && (ts.isAwaitExpression(p) || ts.isParenthesizedExpression(p))) {
    p = p.parent
  }
  return p
}

function findCastArg(
  args: ts.NodeArray<ts.Expression>
): ts.Expression | undefined {
  return args.find(hasTypeCast)
}

/**
 * The `rpc` in `rpc.invoke(...)`, seen through whatever the author wrote to
 * satisfy the type checker.
 *
 * `rpc` is optional on the wire, so a caller that knows it is there reaches for
 * `rpc!.invoke(...)` — and a non-null assertion is a node of its own, not the
 * identifier underneath it. Matching only the bare identifier meant those calls
 * were never recorded as invocations, which is silent rather than loud: the
 * target is not `expose: true`, so nothing else puts it in the registry, and
 * the dispatch fails with "Function not found" at run time on a call site that
 * type-checked. Parentheses are unwrapped for the same reason.
 */
function invocationReceiver(node: ts.Expression): ts.Expression {
  let inner = node
  while (ts.isNonNullExpression(inner) || ts.isParenthesizedExpression(inner)) {
    inner = inner.expression
  }
  return inner
}

/**
 * Helper to extract namespace from a namespaced function reference like 'ext:hello'
 */
function extractNamespace(functionRef: string): string | null {
  const colonIndex = functionRef.indexOf(':')
  if (colonIndex !== -1) {
    return functionRef.substring(0, colonIndex)
  }
  return null
}

function agentInvocationName(
  expression: ts.Expression
): 'runAgent' | 'streamAgent' | 'rpc.agent.run' | 'rpc.agent.stream' | null {
  if (ts.isIdentifier(expression)) {
    if (expression.text === 'runAgent') return 'runAgent'
    if (expression.text === 'streamAgent') return 'streamAgent'
    return null
  }
  if (!ts.isPropertyAccessExpression(expression)) return null
  const method = expression.name.text
  if (method !== 'run' && method !== 'stream') return null
  const agentReceiver = invocationReceiver(expression.expression)
  if (
    !ts.isPropertyAccessExpression(agentReceiver) ||
    agentReceiver.name.text !== 'agent'
  ) {
    return null
  }
  const rpcReceiver = invocationReceiver(agentReceiver.expression)
  const isRpc = ts.isIdentifier(rpcReceiver)
    ? rpcReceiver.text === 'rpc'
    : ts.isPropertyAccessExpression(rpcReceiver) &&
      rpcReceiver.name.text === 'rpc'
  if (!isRpc) return null
  return method === 'run' ? 'rpc.agent.run' : 'rpc.agent.stream'
}

/**
 * Scan for rpc.invoke() calls to track which functions are actually being invoked
 * Also detects addon usage via:
 * - Namespaced calls: rpc.invoke('namespace:function')
 * - Addon helper: addon('namespace:function')
 */
export function addRPCInvocations(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  // Look for call expressions: addon('ext:hello') or rpc.invoke('...')
  if (ts.isCallExpression(node)) {
    const { expression, arguments: args } = node

    // Check for ref('name') calls
    if (ts.isIdentifier(expression) && expression.text === 'ref') {
      const [firstArg] = args
      if (firstArg && ts.isStringLiteral(firstArg)) {
        const functionRef = firstArg.text
        logger.debug(`• Found addon() call: ${functionRef}`)
        state.rpc.invokedFunctions.add(functionRef)

        const namespace = extractNamespace(functionRef)
        if (namespace) {
          logger.debug(`  → Addon detected: ${namespace}`)
          state.rpc.usedAddons.add(namespace)
        }
      }
    }

    // Check for workflow('...'), workflowStart('...'), workflowRun('...'), workflowStatus('...'), graphStart('...') calls
    if (
      ts.isIdentifier(expression) &&
      (expression.text === 'workflow' ||
        expression.text === 'workflowStart' ||
        expression.text === 'workflowRun' ||
        expression.text === 'workflowStatus' ||
        expression.text === 'graphStart')
    ) {
      const [firstArg] = args
      if (firstArg && ts.isStringLiteral(firstArg)) {
        const workflowName = firstArg.text
        logger.debug(`• Found ${expression.text}() call: ${workflowName}`)
        state.workflows.invokedWorkflows.add(workflowName)
      }
    }

    const agentCall = agentInvocationName(expression)
    if (agentCall) {
      const [firstArg] = args
      if (firstArg && ts.isStringLiteral(firstArg)) {
        const agentName = firstArg.text
        logger.debug(`• Found ${agentCall}() call: ${agentName}`)
        const sourceFileName = node.getSourceFile().fileName
        let byFile = state.agents.invokedAgentsByFile.get(sourceFileName)
        if (!byFile) {
          byFile = new Set()
          state.agents.invokedAgentsByFile.set(sourceFileName, byFile)
        }
        byFile.add(agentName)
      } else if (
        firstArg &&
        (ts.isTemplateExpression(firstArg) ||
          ts.isNoSubstitutionTemplateLiteral(firstArg))
      ) {
        logger.warn(`• Found dynamic agent invocation: ${firstArg.getText()}`)
        logger.warn(
          `\tYou can only use string literals for agent names, with ' or " and not \``
        )
      }
    }

    // Check for rpc.invoke('...') calls
    const invokeReceiver = ts.isPropertyAccessExpression(expression)
      ? invocationReceiver(expression.expression)
      : undefined
    if (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'invoke' &&
      invokeReceiver &&
      ts.isIdentifier(invokeReceiver) &&
      invokeReceiver.text === 'rpc'
    ) {
      // Skip PKU940 for generated files — they may contain intentional casts
      // (e.g. the paginated useInfiniteQuery hook in pikku-react-query.gen.ts).
      const sourceFileName = node.getSourceFile().fileName
      const isGenerated =
        sourceFileName.endsWith('.gen.ts') || sourceFileName.endsWith('.gen.js')
      if (!isGenerated) {
        if (hasTypeCast(outerParent(node))) {
          logger.critical(
            ErrorCode.RPC_INVOCATION_TYPE_CAST,
            `rpc.invoke() result is type-cast — remove the 'as' expression and rely on Pikku's generated types`
          )
        }

        const castArg = findCastArg(args)
        if (castArg) {
          logger.critical(
            ErrorCode.RPC_INVOCATION_TYPE_CAST,
            `rpc.invoke() has a type cast on an argument — remove the 'as' expression and rely on Pikku's generated types`
          )
        }
      }

      const [firstArg] = args
      if (firstArg) {
        if (ts.isStringLiteral(firstArg)) {
          const functionRef = firstArg.text
          logger.debug(`• Found RPC invocation: ${functionRef}`)
          state.rpc.invokedFunctions.add(functionRef)

          let byFile = state.rpc.invokedFunctionsByFile.get(sourceFileName)
          if (!byFile) {
            byFile = new Set()
            state.rpc.invokedFunctionsByFile.set(sourceFileName, byFile)
          }
          byFile.add(functionRef)

          const namespace = extractNamespace(functionRef)
          if (namespace) {
            logger.debug(`  → Addon detected: ${namespace}`)
            state.rpc.usedAddons.add(namespace)
            state.serviceAggregation.usedFunctions.add(functionRef)
          }
        }
        // Handle template literals like `function-${name}`
        else if (
          ts.isTemplateExpression(firstArg) ||
          ts.isNoSubstitutionTemplateLiteral(firstArg)
        ) {
          logger.warn(`• Found dynamic RPC invocation: ${firstArg.getText()}`)
          logger.warn(
            `\tYou can only use string literals for RPC function names, with ' or " and not \``
          )
        }
      }
    }
  }
}
