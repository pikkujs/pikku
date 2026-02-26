import * as ts from 'typescript'
import { InspectorState, InspectorLogger } from '../types.js'

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

    // Check for addon('namespace:function') calls
    if (ts.isIdentifier(expression) && expression.text === 'addon') {
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

    // Check for rpc.invoke('...') calls
    if (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'invoke' &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'rpc'
    ) {
      const [firstArg] = args
      if (firstArg) {
        if (ts.isStringLiteral(firstArg)) {
          const functionRef = firstArg.text
          logger.debug(`• Found RPC invocation: ${functionRef}`)
          state.rpc.invokedFunctions.add(functionRef)

          const namespace = extractNamespace(functionRef)
          if (namespace) {
            logger.debug(`  → Addon detected: ${namespace}`)
            state.rpc.usedAddons.add(namespace)
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
